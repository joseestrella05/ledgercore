package main

import (
	"context"
	"database/sql"
	"fmt"
	"sync"

	"ledgercore/internal/database"
	"ledgercore/internal/domain"
	"ledgercore/internal/service"
)

// App struct
type App struct {
	ctx           context.Context
	db            *sql.DB
	dbPath        string
	ledgerService *service.LedgerService
	mu            sync.Mutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

func (a *App) ensureService() error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.ledgerService != nil {
		return nil
	}

	db, dbPath, err := database.InitDB()
	if err != nil {
		return fmt.Errorf("error al conectar con SQLite: %w", err)
	}

	a.db = db
	a.dbPath = dbPath
	a.ledgerService = service.NewLedgerService(db)
	return nil
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	_ = a.ensureService()
}

// shutdown is called when the app closes
func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.db != nil {
		_ = a.db.Close()
		a.db = nil
	}
}

// GetDatabasePath returns the local filesystem path to ledger.db
func (a *App) GetDatabasePath() string {
	if err := a.ensureService(); err != nil {
		path, _ := database.GetDatabasePath()
		return path
	}
	return a.dbPath
}

// GetAccounts retrieves all ledger accounts
func (a *App) GetAccounts() ([]domain.Account, error) {
	if err := a.ensureService(); err != nil {
		return nil, err
	}
	return a.ledgerService.GetAccounts()
}

// GetAccountBalances retrieves all accounts with computed debit/credit totals and balance
func (a *App) GetAccountBalances() ([]domain.AccountBalance, error) {
	if err := a.ensureService(); err != nil {
		return nil, err
	}
	return a.ledgerService.GetAccountBalances()
}

// GetFinancialSummary retrieves dashboard metrics (Assets, Liabilities, Net Worth, Net Flow)
func (a *App) GetFinancialSummary() (*domain.FinancialSummary, error) {
	if err := a.ensureService(); err != nil {
		return nil, err
	}
	return a.ledgerService.GetFinancialSummary()
}

// GetRecentTransactions retrieves the latest transactions with journal entries
func (a *App) GetRecentTransactions(limit int) ([]domain.Transaction, error) {
	if err := a.ensureService(); err != nil {
		return nil, err
	}
	return a.ledgerService.GetRecentTransactions(limit)
}

// CreateTransaction validates double-entry integrity and saves the transaction
func (a *App) CreateTransaction(input domain.CreateTransactionInput) (*domain.Transaction, error) {
	if err := a.ensureService(); err != nil {
		return nil, err
	}
	return a.ledgerService.CreateTransaction(input)
}
