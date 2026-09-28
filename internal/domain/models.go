package domain

// Account types
const (
	TypeAsset     = "ASSET"
	TypeLiability = "LIABILITY"
	TypeEquity    = "EQUITY"
	TypeRevenue   = "REVENUE"
	TypeExpense   = "EXPENSE"
)

// Entry types
const (
	EntryDebit  = "DEBIT"
	EntryCredit = "CREDIT"
)

// Account represents a financial ledger account
type Account struct {
	ID            int64  `json:"id"`
	AccountNumber string `json:"account_number"`
	Name          string `json:"name"`
	Type          string `json:"type"`
	Currency      string `json:"currency"`
	IsActive      bool   `json:"is_active"`
	CreatedAt     string `json:"created_at"`
}

// AccountBalance represents an account with computed debits, credits, and current balance
type AccountBalance struct {
	Account
	DebitTotal  int64 `json:"debit_total"`  // in cents
	CreditTotal int64 `json:"credit_total"` // in cents
	Balance     int64 `json:"balance"`      // in cents (normal balance according to type)
}

// JournalEntry represents a single debit or credit line in a transaction
type JournalEntry struct {
	ID            int64  `json:"id"`
	TransactionID int64  `json:"transaction_id"`
	AccountID     int64  `json:"account_id"`
	AccountNumber string `json:"account_number,omitempty"`
	AccountName   string `json:"account_name,omitempty"`
	Amount        int64  `json:"amount"` // in cents
	EntryType     string `json:"entry_type"` // DEBIT or CREDIT
	Notes         string `json:"notes,omitempty"`
}

// Transaction represents a financial transaction grouping multiple journal entries
type Transaction struct {
	ID              int64          `json:"id"`
	TransactionDate string         `json:"transaction_date"` // YYYY-MM-DD
	Description     string         `json:"description"`
	ReferenceID     string         `json:"reference_id,omitempty"`
	CreatedAt       string         `json:"created_at"`
	Entries         []JournalEntry `json:"entries,omitempty"`
}

// CreateEntryInput is the input payload for an individual entry
type CreateEntryInput struct {
	AccountID int64  `json:"account_id"`
	Amount    int64  `json:"amount"` // in cents (> 0)
	EntryType string `json:"entry_type"` // DEBIT or CREDIT
	Notes     string `json:"notes,omitempty"`
}

// CreateTransactionInput is the payload to create a new double-entry transaction
type CreateTransactionInput struct {
	TransactionDate string             `json:"transaction_date"` // YYYY-MM-DD
	Description     string             `json:"description"`
	ReferenceID     string             `json:"reference_id,omitempty"`
	Entries         []CreateEntryInput `json:"entries"`
}

// FinancialSummary holds the top-level financial metrics for the dashboard
type FinancialSummary struct {
	TotalAssets    int64  `json:"total_assets"`     // in cents
	TotalLiabilities int64 `json:"total_liabilities"` // in cents
	NetWorth       int64  `json:"net_worth"`        // in cents (Assets - Liabilities)
	MonthlyNetFlow int64  `json:"monthly_net_flow"` // in cents (Revenue - Expense in current month)
	Currency       string `json:"currency"`
}
