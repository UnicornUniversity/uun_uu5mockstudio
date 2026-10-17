import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const tmp = (name = "t") => mkdtemp(path.join(tmpdir(), `uu5studio-${name}-`));

export async function makeProject(files = { "a.html": "<h1>a</h1>", "b.html": "<h1>b</h1>" }) {
  const root = await tmp("project");
  await mkdir(path.join(root, ".studio"));
  await writeFile(path.join(root, ".studio", "state.json"), '{"secret":true}');
  for (const [n, c] of Object.entries(files)) await writeFile(path.join(root, n), c);
  return root;
}
