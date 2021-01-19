declare module 'binopsy' {
	class Parser {
		constructor()

		endianess(e: 'big' | 'little'): this

		uint8(name: string): this
		uint16(name: string): this
		buffer(name: string, options?: { length: number }): this
		string(name: string, options?: { length: number }): this

		parse(buffer: Buffer): any
		serialize(input: unknown, target?: Buffer): Buffer
	}

	export = Parser
}
