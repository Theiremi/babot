import { Readable } from 'stream'

export default class extends Readable {
  #sent = false

  constructor(str) {
    super();
    this.str = str;
  }

  _read() {
    if (!this.sent) {
      this.push(this.str);
      this.sent = true
    }
    else {
      this.push(null)
    }
  }
}
