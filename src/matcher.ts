import { expect } from '@jest/globals';
import { ExpectationResult, MatcherState, MatcherUtils } from 'expect';
import { NestingArgs } from './args';
import { NestingMock } from './chainedMock';

const isNestingMock = (value: unknown): value is NestingMock => Boolean(value) && 'callPath' in (value as any);
const isNestingArgs = (value: unknown): value is NestingArgs => Boolean(value) && Array.isArray((value as any).args);

const getCalls = (actual: NestingMock, prev: any[][] = []): any[][] => {
  const { calls, results } = actual.mock;

  return calls
    .map((call, index) => ({
      args: call,
      result: results[index],
    }))
    .flatMap(call => {
      const actualArgs = [...prev, call.args];
      if (call.result.type === 'return' && isNestingMock(call.result.value)) {
        const result = getCalls(call.result.value, actualArgs);
        if (result.length) return result;
      }
      return [actualArgs];
    });
};

const getMatches = (context: MatcherState & MatcherUtils, actual: NestingMock, args: any[][], prev: any[][] = []): any[][] => {
  const { calls, results } = actual.mock;
  const [current, ...rest] = args;

  return calls
    .map((call, index) => ({
      args: call,
      result: results[index],
    }))
    .filter(call => context.equals(call.args, current))
    .flatMap(call => {
      const actualArgs = [...prev, call.args];
      if (rest.length && call.result.type === 'return' && isNestingMock(call.result.value)) {
        const result = getMatches(context, call.result.value, rest, actualArgs);
        if (result.length) return result;
      }
      return [actualArgs];
    });
};

const printCall = (args: any[][]) => `fn(${args.map(call => call.join(', ')).join(')(')})`;

function toHaveBeenNestedCalledWith(
  this: MatcherState & MatcherUtils,
  actual: unknown,
  args: any[][] | NestingArgs,
): ExpectationResult {
  if (!isNestingMock(actual)) {
    throw new Error('Actual must be a Nesting mock');
  }

  const expected = isNestingArgs(args) ? args.args : args;

  if (!Array.isArray(expected)) {
    throw new Error('Args must be of type Array<Array<any>>');
  }

  const calls = getCalls(actual);
  const matches = getMatches(this, actual, expected);

  if (!matches.length) {
    return {
      message: () => `Expected the nested function to have been called
Expected: ${printCall(expected)}
Actual: Number of calls: 0`,
      pass: false,
    };
  }

  const isMatch = matches.find(m => m.length === expected.length);

  if (isMatch) {
    return {
      message: () => `Expected calls not to match ${printCall(expected)}`,
      pass: true,
    };
  }

  return {
    message: () => `Expected calls to match
Expected: ${printCall(expected)}
Actual:
  ${calls
    .sort((a, b) => b.length - a.length)
    .map(m => printCall(m))
    .join('\n  ')}`,
    pass: false,
  };
}

expect.extend({
  toHaveBeenNestedCalledWith,
  toBeNestedCalledWith: toHaveBeenNestedCalledWith,
});

export {};
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveBeenNestedCalledWith(nestedArgs: any[][] | NestingArgs): R;
    }
  }
}