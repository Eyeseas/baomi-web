export class BaomiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BaomiError'
  }
}
