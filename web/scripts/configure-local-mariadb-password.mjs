import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const composePath = path.join(repositoryRoot, "compose.yaml");
const envPath = path.join(repositoryRoot, ".env");

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function required(value, name) {
  if (!value || !value.trim()) throw new Error(`${name} must not be empty.`);
  return value;
}

function sqlString(value) {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function sqlIdentifier(value) {
  return `\`${value.replaceAll("`", "``")}\``;
}

function runDocker(argumentsList, options = {}) {
  return spawnSync("docker", ["compose", "-f", composePath, ...argumentsList], {
    cwd: repositoryRoot,
    encoding: "utf8",
    ...options,
  });
}

const fileEnv = readEnvFile(envPath);
const env = { ...fileEnv, ...process.env };
const database = required(env.DB_NAME ?? "the_test", "DB_NAME");
const user = required(env.DB_USER ?? "the_test", "DB_USER");
const password = required(env.DB_PASSWORD ?? "the-test-local-db-password", "DB_PASSWORD");
const rootPassword = required(env.MARIADB_ROOT_PASSWORD ?? "the-test-local-root-password", "MARIADB_ROOT_PASSWORD");

if (user === "root") throw new Error("DB_USER must not be root for the application connection.");

const start = runDocker(["up", "-d", "mariadb"], { stdio: "inherit" });
if (start.error || start.status !== 0) {
  throw start.error ?? new Error("Failed to start the MariaDB container.");
}

const account = sqlString(user);
const applicationPassword = sqlString(password);
const rootSecret = sqlString(rootPassword);
const schema = sqlIdentifier(database);
const sql = [
  `CREATE DATABASE IF NOT EXISTS ${schema};`,
  `CREATE USER IF NOT EXISTS ${account}@'%' IDENTIFIED BY ${applicationPassword};`,
  `ALTER USER ${account}@'%' IDENTIFIED BY ${applicationPassword};`,
  `CREATE USER IF NOT EXISTS ${account}@'localhost' IDENTIFIED BY ${applicationPassword};`,
  `ALTER USER ${account}@'localhost' IDENTIFIED BY ${applicationPassword};`,
  `GRANT ALL PRIVILEGES ON ${schema}.* TO ${account}@'%';`,
  `GRANT ALL PRIVILEGES ON ${schema}.* TO ${account}@'localhost';`,
  `ALTER USER 'root'@'localhost' IDENTIFIED BY ${rootSecret};`,
  "FLUSH PRIVILEGES;",
].join("\n");

let lastError = "";
for (let attempt = 1; attempt <= 40; attempt += 1) {
  for (const candidate of [rootPassword, ""]) {
    const clientArguments = ["exec", "-T", "mariadb", "mariadb", "--protocol=socket", "--user=root"];
    if (candidate) clientArguments.push(`--password=${candidate}`);
    const result = runDocker(clientArguments, { input: sql });
    if (result.error) throw result.error;
    if (result.status === 0) {
      console.log("MariaDBのrootユーザーとアプリ用ユーザーへパスワードを設定しました。");
      console.log("docker compose up -d --build web でアプリを起動できます。");
      process.exit(0);
    }
    lastError = result.stderr?.trim() || result.stdout?.trim() || `exit code ${result.status}`;
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}

throw new Error(`MariaDBへ接続できず、パスワードを設定できませんでした。現在のrootパスワードが別に設定されている可能性があります。${lastError ? ` Detail: ${lastError}` : ""}`);
