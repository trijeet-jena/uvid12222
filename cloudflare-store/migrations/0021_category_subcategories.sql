ALTER TABLE categories ADD COLUMN parent_slug TEXT REFERENCES categories(slug) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_slug,sort_order,name);
