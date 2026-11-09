import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// 用真实 SQLite 执行服务层 SQL，避免只匹配 SQL 文本的伪数据库测试。
export function generationTestDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    sqlite.exec(readFileSync("migrations/" + migration, "utf8"));
  }
  for (const id of ["user_1", "user_2"]) {
    sqlite
      .prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)")
      .run(id, id, id + "@example.test");
  }
  function prepare(sql: string, values: SQLInputValue[] = []) {
    return {
      bind: (...bound: SQLInputValue[]) => prepare(sql, bound),
      first: async () => sqlite.prepare(sql).get(...values) || null,
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      run: async () => ({
        meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) },
      }),
    };
  }
  return { sqlite, binding: { prepare } as unknown as D1Database };
}
