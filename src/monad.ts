import { type Base, type Infer, validate } from './schema'

// Errors

export class SchemaError extends Error {
  constructor(
    public kind: 'Input' | 'Output',
    public functionName: string,
    public violations: string[] = []
  ) {
    super(`${kind} validation failed for '${functionName}'`)
    this.name = 'SchemaError'
  }
}

export class TimeoutError extends Error {
  constructor(public functionName: string, public ms: number) {
    super(`Function '${functionName}' timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

// Types

export type GuardedFunc<I, O> = {
  (input: I): Promise<O>
  input: Base<I>
  output: Base<O>
  impl: (input: I) => Promise<O> | O
  _isGuarded: true
}

type Chain<Val, Registry> = {
  result: () => Promise<Val>
} & {
  [K in keyof Registry]: Registry[K] extends GuardedFunc<infer I, infer O>
    ? Val extends I
      ? () => Chain<O, Registry>
      : never
    : never
}

type MBuilder<Registry> = {
  [K in keyof Registry]: Registry[K] extends GuardedFunc<infer I, infer O>
    ? (input: I) => Chain<O, Registry>
    : never
}

// M Class

export class M<R extends Record<string, GuardedFunc<any, any>>> {
  private registry: R

  constructor(registry: R) {
    this.registry = registry
    return new Proxy(this, {
      get: (target, prop: string) => {
        if (prop in target.registry) {
          return (input: any) => target.start(prop, input)
        }
        return undefined
      },
    }) as any
  }

  static func<I extends Base<any>, O extends Base<any>>(
    inputSchema: I,
    outputSchema: O,
    impl: (data: Infer<I>) => Promise<Infer<O>> | Infer<O>,
    timeoutMs: number = 5000
  ): GuardedFunc<Infer<I>, Infer<O>> {
    const wrapper = async (data: Infer<I>) => {
      // 1. Input Validation
      const validIn = validate(data, inputSchema.schema, { fullScan: true })
      if (!validIn) {
        throw new SchemaError('Input', 'Anonymous', ['Input schema mismatch'])
      }

      // 2. Execution with Timeout
      let timer: any
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError('Anonymous', timeoutMs))
        }, timeoutMs)
      })

      let result: any
      try {
        result = await Promise.race([
          Promise.resolve().then(() => impl(data)),
          timeoutPromise,
        ])
      } finally {
        clearTimeout(timer)
      }

      // 3. Output Validation
      const validOut = validate(result, outputSchema.schema, { fullScan: true })
      if (!validOut) {
        throw new SchemaError('Output', 'Anonymous', ['Output schema mismatch'])
      }

      return result
    }

    wrapper.input = inputSchema
    wrapper.output = outputSchema
    wrapper.impl = impl
    wrapper._isGuarded = true as const

    return wrapper as GuardedFunc<Infer<I>, Infer<O>>
  }

  private start(fnName: string, input: any): any {
    const fn = this.registry[fnName]

    const promise = (async () => {
      if (!fn) {
        throw new Error(`Function '${fnName}' not found in registry`)
      }
      try {
        return await fn(input)
      } catch (err) {
        this.enrichError(err, fnName)
        throw err
      }
    })()

    return this.createChain(promise, this.registry)
  }

  private createChain(currentPromise: Promise<any>, registry: R): any {
    const chainHandler = {
      get: (_: any, prop: string) => {
        if (prop === 'result') {
          return () => currentPromise
        }

        if (prop in registry) {
          return () => {
            const nextPromise = currentPromise.then(async (currentVal) => {
              const fn = registry[prop]
              if (!fn) {
                throw new Error(`Function '${prop}' not found in registry`)
              }
              try {
                return await fn(currentVal)
              } catch (err) {
                this.enrichError(err, prop)
                throw err
              }
            })

            return this.createChain(nextPromise, registry)
          }
        }
        return undefined
      },
    }

    return new Proxy({}, chainHandler)
  }

  private enrichError(err: any, fnName: string) {
    if (err instanceof SchemaError && err.functionName === 'Anonymous') {
      err.functionName = fnName
      err.message = `${err.kind} validation failed for '${fnName}'`
    }
    if (err instanceof TimeoutError && err.functionName === 'Anonymous') {
      err.functionName = fnName
      err.message = `Function '${fnName}' timed out after ${err.ms}ms`
    }
  }
}

export const createM = <R extends Record<string, GuardedFunc<any, any>>>(
  r: R
): MBuilder<R> => {
  return new M(r) as any
}