// Validate streamed numbered citation tags before exposing them to the client.
// Small pending parenthetical spans handle tags split across upstream tokens.
export function createCitationFilter(documentCount) {
  let pending = '';
  const clean = (span) => {
    if (!/^[([]\s*doc(?:ument)?s?\b/i.test(span)) return span;
    const numbers = span.match(/\d+/g)?.map(Number) || [];
    return numbers.length && numbers.some((n) => n < 1 || n > documentCount) ? '' : span;
  };
  return {
    push(text) {
      let output = '';
      for (const char of text) {
        if (pending) {
          pending += char;
          if (char === ')' || char === ']') { output += clean(pending); pending = ''; }
          else if (pending.length > 128) { output += clean(pending); pending = ''; }
        } else if (char === '(' || char === '[') pending = char;
        else output += char;
      }
      return output;
    },
    finish() { const output = clean(pending); pending = ''; return output; },
  };
}
