export interface HeadingEntry {
  level: 1 | 2 | 3;
  title: string;
  offset: number;
  line: number;
}

export function parseHeadings(content: string): HeadingEntry[] {
  const headings: HeadingEntry[] = [];
  const lines = content.split("\n");
  let offset = 0;
  lines.forEach((line, lineIdx) => {
    const m = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (m) {
      headings.push({
        level: m[1].length as 1 | 2 | 3,
        title: m[2],
        offset,
        line: lineIdx + 1,
      });
    }
    offset += line.length + 1;
  });
  return headings;
}
