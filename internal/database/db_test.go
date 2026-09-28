package database_test

import (
	"os"
	"testing"

	"ledgercore/internal/database"
)

func TestInitDB(t *testing.T) {
	db, path, err := database.InitDB()
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer db.Close()

	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatalf("Database file not found at %s", path)
	}

	// Verify accounts seed count
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM accounts").Scan(&count); err != nil {
		t.Fatalf("QueryRow failed: %v", err)
	}

	if count < 6 {
		t.Fatalf("Expected at least 6 accounts, got %d", count)
	}
}
