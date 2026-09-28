package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// GetDatabasePath returns the canonical path for LedgerCore database
func GetDatabasePath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("error obteniendo el directorio de usuario: %w", err)
	}

	appSupportDir := filepath.Join(homeDir, "Library", "Application Support", "LedgerCore")
	if err := os.MkdirAll(appSupportDir, 0755); err != nil {
		return "", fmt.Errorf("error creando directorio de aplicación: %w", err)
	}

	return filepath.Join(appSupportDir, "ledger.db"), nil
}

// InitDB initializes the SQLite database with pure Go modernc driver, applies pragmas, DDL migrations, and initial seed
func InitDB() (*sql.DB, string, error) {
	dbPath, err := GetDatabasePath()
	if err != nil {
		return nil, "", err
	}

	// modernc.org/sqlite connection string with immediate locking and busy timeout
	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_txlock=immediate", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, "", fmt.Errorf("error abriendo conexión SQLite: %w", err)
	}

	// SQLite WAL mode works best with max 1 open connection or properly configured pool
	db.SetMaxOpenConns(1)

	// Apply required PRAGMAs
	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA temp_store = MEMORY;",
		"PRAGMA cache_size = -64000;",
	}

	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			db.Close()
			return nil, "", fmt.Errorf("error aplicando pragma %q: %w", pragma, err)
		}
	}

	// Run migrations
	if err := runMigrations(db); err != nil {
		db.Close()
		return nil, "", fmt.Errorf("error ejecutando migraciones DDL: %w", err)
	}

	// Run seed data
	if err := seedInitialAccounts(db); err != nil {
		db.Close()
		return nil, "", fmt.Errorf("error sembrando cuentas iniciales: %w", err)
	}

	return db, dbPath, nil
}

func runMigrations(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS accounts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		account_number TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		type TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
		currency TEXT NOT NULL DEFAULT 'DOP',
		is_active INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		transaction_date TEXT NOT NULL,
		description TEXT NOT NULL,
		reference_id TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS journal_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		transaction_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		amount INTEGER NOT NULL CHECK (amount > 0),
		entry_type TEXT NOT NULL CHECK (entry_type IN ('DEBIT','CREDIT')),
		notes TEXT,
		FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
		FOREIGN KEY (account_id) REFERENCES accounts(id)
	);

	CREATE INDEX IF NOT EXISTS idx_journal_entries_account ON journal_entries(account_id, id);
	CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
	`

	_, err := db.Exec(schema)
	return err
}

func seedInitialAccounts(db *sql.DB) error {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM accounts").Scan(&count)
	if err != nil {
		return err
	}

	if count > 0 {
		return nil // already seeded
	}

	seedAccounts := []struct {
		number   string
		name     string
		accType  string
		currency string
	}{
		{"1010", "Bancos DOP", "ASSET", "DOP"},
		{"1020", "Cuentas por Cobrar", "ASSET", "DOP"},
		{"2010", "Tarjeta de Crédito", "LIABILITY", "DOP"},
		{"3010", "Capital Propio", "EQUITY", "DOP"},
		{"4010", "Ingresos por Soporte/Servicios", "REVENUE", "DOP"},
		{"5010", "Gastos Operativos", "EXPENSE", "DOP"},
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare("INSERT INTO accounts (account_number, name, type, currency, is_active) VALUES (?, ?, ?, ?, 1)")
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, acc := range seedAccounts {
		if _, err := stmt.Exec(acc.number, acc.name, acc.accType, acc.currency); err != nil {
			return err
		}
	}

	return tx.Commit()
}
