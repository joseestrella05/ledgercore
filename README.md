# LedgerCore ⚖️

[![Go Version](https://img.shields.io/badge/Go-1.26+-00ADD8?style=for-the-badge&logo=go)](https://golang.org)
[![Wails v2](https://img.shields.io/badge/Wails-v2-DF0000?style=for-the-badge&logo=wails)](https://wails.io)
[![SQLite Pure Go](https://img.shields.io/badge/SQLite-Pure--Go-003B57?style=for-the-badge&logo=sqlite)](https://gitlab.com/cznic/sqlite)
[![Platform macOS](https://img.shields.io/badge/Platform-macOS%20Apple%20Silicon%20(arm64)-000000?style=for-the-badge&logo=apple)](https://apple.com)
[![React 19](https://img.shields.io/badge/Frontend-React%2019%20%2B%20TypeScript-61DAFB?style=for-the-badge&logo=react)](https://react.dev)

**LedgerCore** es un sistema de gestión contable por partida doble desarrollado como una aplicación de escritorio nativa para macOS (Apple Silicon M-Series). Combina la potencia y seguridad de memoria de **Go** en el backend con una interfaz moderna y reactiva en **React / TypeScript / Vite** renderizada a través del motor nativo WebKit (`WKWebView`) provisto por **Wails v2**.

---

## 🏛️ Principios de Arquitectura

### 1. Contabilidad por Partida Doble Estricta
* Ecuación fundamental:
  $$\text{Activos} = \text{Pasivos} + \text{Patrimonio Neto}$$
* Toda transacción contable requiere al menos 2 asientos (*legs*) donde la suma algebraica de los débitos sea estrictamente idéntica a la suma de los créditos:
  $$\sum \text{Débitos} = \sum \text{Créditos} \quad (\text{Diferencia} = 0)$$
* Validación dual: Se valida primero en la capa de interfaz en tiempo real (con balanceo automático) y de forma estricta en el motor contable en Go antes de persistir.

### 2. Integridad del Dinero e Invarianza Numérica (Cero Floats)
* Todos los montos monetarios se manipulan y almacenan exclusivamente en **enteros (`INTEGER`) representando centavos**.
* Se elimina por completo el riesgo de errores de precisión por punto flotante binario (IEEE 754). La conversión a decimales (DOP) se efectúa únicamente en la capa de presentación.

### 3. Motor SQLite en Go Puro (Zero-CGO) y Concurrencia ACID
* Emplea el driver en Go puro `modernc.org/sqlite` con compilación `CGO_ENABLED=0`, permitiendo portabilidad absoluta y cero dependencias de compiladores C externos para el motor SQL.
* Cada transacción se ejecuta bajo `BEGIN IMMEDIATE TRANSACTION` asegurando aislamiento serializable y evitando contenciones o deadlocks entre lectores y escritores.
* **Pragmas de alto rendimiento y durabilidad:**
  ```sql
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA temp_store = MEMORY;
  PRAGMA cache_size = -64000;
  ```

### 4. Persistencia Estándar en macOS
* Cumpliendo con las directrices de Apple Human Interface y almacenamiento de aplicaciones en macOS, la base de datos se aloja en:
  ```
  ~/Library/Application Support/LedgerCore/ledger.db
  ```
* La creación del directorio y la ejecución de migraciones DDL se realizan de manera automática al inicializar la aplicación.

### 5. Frontend Reactivo sobre WebKit Nativo
* Sin sobrecargas pesadas de Chromium: utiliza el runtime ligero nativo de macOS (`WKWebView`) vía Wails v2.
* Reactividad mediante mutaciones de estado automáticas: al asentar una transacción, los balances, métricas del dashboard y el libro diario se recalculan y actualizan inmediatamente sin requerir recargas ni botones manuales de refresco.
* Asistente de autocompletado en el formulario: en transacciones estándar de dos renglones, el importe del contra-asiento se auto-calcula al escribir el primer monto para garantizar el balance instantáneo.

---

## 📊 Esquema Relacional de Base de Datos

```sql
-- Catálogo de Cuentas Contables
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
    currency TEXT NOT NULL DEFAULT 'DOP',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Cabecera de Transacciones
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date TEXT NOT NULL,
    description TEXT NOT NULL,
    reference_id TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Asientos de Diario
CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0), -- en centavos
    entry_type TEXT NOT NULL CHECK (entry_type IN ('DEBIT','CREDIT')),
    notes TEXT,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Índices de Alta Eficiencia
CREATE INDEX idx_journal_entries_account ON journal_entries(account_id, id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
```

### Catálogo de Cuentas Inicial (Semilla)
Al arrancar por primera vez, el sistema autosemilla el plan contable esencial:

| Código | Cuenta | Tipo | Moneda | Naturaleza |
| :--- | :--- | :--- | :---: | :--- |
| `1010` | **Bancos DOP** | `ASSET` | DOP | Débito |
| `1020` | **Cuentas por Cobrar** | `ASSET` | DOP | Débito |
| `2010` | **Tarjeta de Crédito** | `LIABILITY` | DOP | Crédito |
| `3010` | **Capital Propio** | `EQUITY` | DOP | Crédito |
| `4010` | **Ingresos por Soporte/Servicios** | `REVENUE` | DOP | Crédito |
| `5010` | **Gastos Operativos** | `EXPENSE` | DOP | Débito |

---

## 🛠️ Desarrollo Local y Compilación

### Requisitos Previos
- **macOS** (Optimizado para Apple Silicon M1/M2/M3/M4)
- **Go 1.22+**
- **Node.js 18+** y **npm**
- **Wails CLI v2**:
  ```bash
  go install github.com/wailsapp/wails/v2/cmd/wails@latest
  ```

### Ejecución en Modo Desarrollo (Hot-Reload)
Inicia el entorno de desarrollo con recarga en vivo de Go y Vite:
```bash
wails dev
```

### Ejecutar Pruebas Automatizadas del Motor Contable
```bash
CGO_ENABLED=0 go test -v ./...
```

### Compilar e Instalar en `/Applications`
Para generar la aplicación empaquetada y optimizada para Apple Silicon:
```bash
# 1. Compilar bundle nativo
wails build -platform darwin/arm64

# 2. Instalar en Applications
rm -rf /Applications/LedgerCore.app
cp -R build/bin/LedgerCore.app /Applications/

# 3. Remover atributos de cuarentena
xattr -cr /Applications/LedgerCore.app
```

---

## 📂 Estructura del Proyecto

```
ledgercore/
├── app.go                      # Wails bindings y controladores expuestos
├── main.go                     # Punto de entrada y configuración de ventana nativa
├── go.mod / go.sum             # Dependencias Go (modernc.org/sqlite, wails v2)
├── wails.json                  # Configuración de compilación y metadatos
├── internal/
│   ├── database/
│   │   ├── db.go               # Conexión SQLite WAL, pragmas y migraciones DDL
│   │   └── db_test.go          # Pruebas de integración de base de datos
│   ├── domain/
│   │   └── models.go           # Estructuras de dominio (Account, Transaction, Summary)
│   └── service/
│       ├── ledger.go           # Lógica contable, partida doble y reportes analíticos
│       └── ledger_test.go      # Pruebas unitarias de balance y validación de asientos
└── frontend/
    ├── src/
    │   ├── App.tsx             # Interfaz de usuario (Dashboard, Balances, Modal)
    │   ├── style.css           # Estilos de tema oscuro moderno
    │   └── main.tsx            # Bootstrap de React
    └── wailsjs/                # Enlaces generados automáticamente entre Go y TS
```

---

## 📄 Licencia
Este proyecto está bajo la Licencia MIT.
