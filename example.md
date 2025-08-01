// @strict: true

// foo.ts
export function greet(name: string) {
    return `Hello, ${name}!`;
}

// bar.ts
import { greet } from "./foo.js";

const result = greet(/*!*/);
//                    ^ Position for signature help