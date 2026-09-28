package service_test

import (
	"database/sql"
	"testing"

	"ledgercore/internal/domain"
	"ledgercore/internal/service"
	_ "modernc.org/sqlite"
)

func setupTestDB(t *testing.T) (*sql.DB, *service.LedgerService) {
	// In-memory SQLite DB with modernc.org/sqlite
	db, err := sql.Open("sqlite", ":memory:?_pragma=busy_timeout(5000)&_txlock=immediate")
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}

	schema := `
	CREATE TABLE accounts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		account_number TEXT NOT NULL UNIQUE,
		name TEXT NOT NULL,
		type TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
		currency TEXT NOT NULL DEFAULT 'DOP',
		is_active INTEGER NOT NULL DEFAULT 1,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		transaction_date TEXT NOT NULL,
		description TEXT NOT NULL,
		reference_id TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE journal_entries (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		transaction_id INTEGER NOT NULL,
		account_id INTEGER NOT NULL,
		amount INTEGER NOT NULL CHECK (amount > 0),
		entry_type TEXT NOT NULL CHECK (entry_type IN ('DEBIT','CREDIT')),
		notes TEXT,
		FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
		FOREIGN KEY (account_id) REFERENCES accounts(id)
	);

	INSERT INTO accounts (id, account_number, name, type, currency) VALUES
	(1, '1010', 'Bancos DOP', 'ASSET', 'DOP'),
	(2, '1020', 'Cuentas por Cobrar', 'ASSET', 'DOP'),
	(3, '2010', 'Tarjeta de Crédito', 'LIABILITY', 'DOP'),
	(4, '3010', 'Capital Propio', 'EQUITY', 'DOP'),
	(5, '4010', 'Ingresos por Soporte/Servicios', 'REVENUE', 'DOP'),
	(6, '5010', 'Gastos Operativos', 'EXPENSE', 'DOP');
	`
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("failed to create schema: %v", err)
	}

	return db, service.NewLedgerService(db)
}

func TestDoubleEntryValidation(t *testing.T) {
	db, svc := setupTestDB(t)
	defer db.Close()

	// 1. Unbalanced transaction should FAIL
	unbalancedInput := domain.CreateTransactionInput{
		TransactionDate: "2026-09-28",
		Description:     "Asiento no balanceado de prueba",
		Entries: []domain.CreateEntryInput{
			{AccountID: 1, Amount: 100000, EntryType: domain.EntryDebit},  // 1,000 DOP debit
			{AccountID: 4, Amount: 50000, EntryType: domain.EntryCredit},  // 500 DOP credit
		},
	}

	_, err := svc.CreateTransaction(unbalancedInput)
	if err == nil {
		t.Fatalf("se esperaba error por transacción no balanceada pero fue exitosa")
	}

	// 2. Balanced transaction should SUCCEED: Capital initial deposit (Bank debit 500,000 DOP, Equity credit 500,000 DOP)
	balancedInput := domain.CreateTransactionInput{
		TransactionDate: "2026-09-28",
		Description:     "Aporte de Capital Inicial",
		ReferenceID:     "CAP-001",
		Entries: []domain.CreateEntryInput{
			{AccountID: 1, Amount: 50000000, EntryType: domain.EntryDebit},  // 500,000 DOP (50,000,000 cents)
			{AccountID: 4, Amount: 50000000, EntryType: domain.EntryCredit}, // 500,000 DOP
		},
	}

	tx, err := svc.CreateTransaction(balancedInput)
	if err != nil {
		t.Fatalf("error inesperado creando transacción balanceada: %v", err)
	}
	if tx.ID <= 0 {
		t.Fatalf("ID de transacción inválido: %d", tx.ID)
	}

	// 3. Verify Account Balances
	balances, err := svc.GetAccountBalances()
	if err != nil {
		t.Fatalf("error obteniendo balances: %v", err)
	}

	var bankBalance int64
	var equityBalance int64
	for _, b := range balances {
		if b.AccountNumber == "1010" {
			bankBalance = b.Balance
		}
		if b.AccountNumber == "3010" {
			equityBalance = b.Balance
		}
	}

	if bankBalance != 50000000 {
		t.Errorf("balance de banco esperado 50000000, obtenido %d", bankBalance)
	}
	if equityBalance != 50000000 {
		t.Errorf("balance de capital esperado 50000000, obtenido %d", equityBalance)
	}

	// 4. Financial Summary
	summary, err := svc.GetFinancialSummary()
	if err != nil {
		t.Fatalf("error obteniendo resumen financiero: %v", err)
	}
	if summary.TotalAssets != 50000000 {
		t.Errorf("TotalAssets esperado 50000000, obtenido %d", summary.TotalAssets)
	}
	if summary.NetWorth != 50000000 {
		t.Errorf("NetWorth esperado 50000000, obtenido %d", summary.NetWorth)
	}
}
