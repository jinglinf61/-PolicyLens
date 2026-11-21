CREATE TABLE IF NOT EXISTS site_checks (
  group_name TEXT NOT NULL,
  url TEXT NOT NULL,
  unit TEXT NOT NULL,
  checked TEXT NOT NULL,
  count INTEGER NOT NULL,
  error TEXT NOT NULL,
  PRIMARY KEY(group_name,url)
);
CREATE TABLE IF NOT EXISTS site_records (
  group_name TEXT NOT NULL,
  url TEXT NOT NULL,
  unit TEXT NOT NULL,
  title TEXT NOT NULL,
  published TEXT NOT NULL,
  topics TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  PRIMARY KEY(group_name,url)
);
