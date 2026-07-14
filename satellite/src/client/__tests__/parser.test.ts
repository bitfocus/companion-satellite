import { describe, it, expect } from 'vitest'
import { parseLineParameters } from '../parser.js'

describe('parseLineParameters', () => {
	describe('basic key/value parsing', () => {
		it('parses a single key=value pair', () => {
			expect({ ...parseLineParameters('KEY=value') }).toEqual({ KEY: 'value' })
		})

		it('parses multiple space-separated pairs', () => {
			expect({ ...parseLineParameters('A=1 B=2 C=3') }).toEqual({ A: '1', B: '2', C: '3' })
		})

		it('parses an empty value as an empty string', () => {
			expect(parseLineParameters('KEY=').KEY).toBe('')
		})

		it('keeps the value verbatim (no numeric coercion)', () => {
			const params = parseLineParameters('N=42 F=0')
			expect(params.N).toBe('42')
			expect(params.F).toBe('0')
		})
	})

	describe('valueless flags', () => {
		it('treats a token with no `=` as boolean true', () => {
			expect(parseLineParameters('FLAG')).toMatchObject({ FLAG: true })
		})

		it('mixes flags and key/value pairs', () => {
			expect({ ...parseLineParameters('A=1 FLAG B=2') }).toEqual({ A: '1', FLAG: true, B: '2' })
		})
	})

	describe('values containing `=` (only split on the first)', () => {
		it('preserves base64 `=` padding, e.g. a data-url bitmap', () => {
			const value = 'iVBORw0KGgoAAAANSUhEUg=='
			expect(parseLineParameters(`BITMAP=${value}`).BITMAP).toBe(value)
		})

		it('keeps every `=` after the first in the value', () => {
			expect(parseLineParameters('X=a=b=c').X).toBe('a=b=c')
		})
	})

	describe('quoted values', () => {
		it('keeps spaces inside a quoted value and strips the quotes', () => {
			expect(parseLineParameters('TEXT="hello world"').TEXT).toBe('hello world')
		})

		it('does not split on `=` inside a quoted value', () => {
			expect({ ...parseLineParameters('PATH=0/0 X="a=b=c"') }).toEqual({ PATH: '0/0', X: 'a=b=c' })
		})

		it('strips quotes that appear mid-token', () => {
			expect(parseLineParameters('KEY=va"lue"').KEY).toBe('value')
		})

		it('supports a quoted key containing spaces', () => {
			expect(parseLineParameters('"quoted key"=v')['quoted key']).toBe('v')
		})
	})

	describe('backslash escapes', () => {
		it('unescapes a quote inside a quoted value', () => {
			expect(parseLineParameters('KEY="a\\"b"').KEY).toBe('a"b')
		})

		it('unescapes a space so it does not split the token', () => {
			expect(parseLineParameters('KEY=a\\ b').KEY).toBe('a b')
		})

		it('ignores a dangling trailing backslash instead of appending "undefined"', () => {
			expect(parseLineParameters('KEY=a\\').KEY).toBe('a')
			expect(parseLineParameters('FLAG\\')).toMatchObject({ FLAG: true })
		})
	})

	describe('whitespace handling', () => {
		it('does not treat tabs as separators', () => {
			expect(parseLineParameters('A=1\tB=2').A).toBe('1\tB=2')
		})

		it('ignores consecutive spaces (no empty-string key)', () => {
			expect({ ...parseLineParameters('A=1  B=2') }).toEqual({ A: '1', B: '2' })
		})

		it('ignores leading and trailing spaces', () => {
			expect({ ...parseLineParameters('  A=1 B=2  ') }).toEqual({ A: '1', B: '2' })
		})
	})

	describe('prototype-pollution hardening', () => {
		it('returns a prototype-less object', () => {
			expect(Object.getPrototypeOf(parseLineParameters('A=1'))).toBeNull()
		})

		it('drops dangerous keys (__proto__, constructor, prototype, ...)', () => {
			const result = parseLineParameters(
				'__proto__=injected constructor=bad prototype=x __defineGetter__=y normal=ok',
			)
			expect(result).not.toHaveProperty('__proto__')
			expect(result).not.toHaveProperty('constructor')
			expect(result).not.toHaveProperty('prototype')
			expect(result).not.toHaveProperty('__defineGetter__')
			expect(result.normal).toBe('ok')
			expect(Object.prototype).not.toHaveProperty('injected')
		})

		it('drops a dangerous key even when its value contains =', () => {
			const result = parseLineParameters('__proto__=a=b normal=ok')
			expect(result).not.toHaveProperty('__proto__')
			expect(result.normal).toBe('ok')
		})
	})

	describe('edge cases', () => {
		it('maps an empty line to an empty object', () => {
			expect({ ...parseLineParameters('') }).toEqual({})
		})

		it('maps a whitespace-only line to an empty object', () => {
			expect({ ...parseLineParameters('   ') }).toEqual({})
		})
	})

	describe('draw parameters', () => {
		it('extracts a base64 LEDS parameter alongside other params', () => {
			// LEDS is always `segments * 3` bytes; this payload base64-encodes to a value containing `/`
			const leds = Buffer.from([255, 0, 0, 0, 255, 0]).toString('base64')
			expect(leds).toContain('/')

			const params = parseLineParameters(`DEVICEID=abc123 CONTROLID=0/0 LEDS=${leds} PRESSED=1`)

			expect(params).toMatchObject({
				DEVICEID: 'abc123',
				CONTROLID: '0/0',
				LEDS: leds,
				PRESSED: '1',
			})
		})

		it('round-trips a LEDS buffer through base64', () => {
			const original = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9])
			const params = parseLineParameters(`LEDS=${original.toString('base64')}`)

			expect(typeof params.LEDS).toBe('string')
			expect(Buffer.from(params.LEDS as string, 'base64')).toEqual(original)
		})

		it('preserves the base64 `=` padding of a quoted data: url bitmap', () => {
			const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
			expect(parseLineParameters(`BITMAP="${dataUrl}"`).BITMAP).toBe(dataUrl)
		})

		it('parses a realistic KEY-STATE line with mixed value kinds', () => {
			const params = parseLineParameters(
				'DEVICEID=surface-1 KEY=5 COLOR=#ff0000 TEXT="Play Clip" BITMAP=aGVsbG8= PRESSED=0',
			)
			expect(params).toMatchObject({
				DEVICEID: 'surface-1',
				KEY: '5',
				COLOR: '#ff0000',
				TEXT: 'Play Clip',
				BITMAP: 'aGVsbG8=',
				PRESSED: '0',
			})
		})
	})
})
