export namespace domain {
	
	export class Account {
	    id: number;
	    account_number: string;
	    name: string;
	    type: string;
	    currency: string;
	    is_active: boolean;
	    created_at: string;
	
	    static createFrom(source: any = {}) {
	        return new Account(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.account_number = source["account_number"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.currency = source["currency"];
	        this.is_active = source["is_active"];
	        this.created_at = source["created_at"];
	    }
	}
	export class AccountBalance {
	    id: number;
	    account_number: string;
	    name: string;
	    type: string;
	    currency: string;
	    is_active: boolean;
	    created_at: string;
	    debit_total: number;
	    credit_total: number;
	    balance: number;
	
	    static createFrom(source: any = {}) {
	        return new AccountBalance(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.account_number = source["account_number"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.currency = source["currency"];
	        this.is_active = source["is_active"];
	        this.created_at = source["created_at"];
	        this.debit_total = source["debit_total"];
	        this.credit_total = source["credit_total"];
	        this.balance = source["balance"];
	    }
	}
	export class CreateEntryInput {
	    account_id: number;
	    amount: number;
	    entry_type: string;
	    notes?: string;
	
	    static createFrom(source: any = {}) {
	        return new CreateEntryInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.account_id = source["account_id"];
	        this.amount = source["amount"];
	        this.entry_type = source["entry_type"];
	        this.notes = source["notes"];
	    }
	}
	export class CreateTransactionInput {
	    transaction_date: string;
	    description: string;
	    reference_id?: string;
	    entries: CreateEntryInput[];
	
	    static createFrom(source: any = {}) {
	        return new CreateTransactionInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.transaction_date = source["transaction_date"];
	        this.description = source["description"];
	        this.reference_id = source["reference_id"];
	        this.entries = this.convertValues(source["entries"], CreateEntryInput);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FinancialSummary {
	    total_assets: number;
	    total_liabilities: number;
	    net_worth: number;
	    monthly_net_flow: number;
	    currency: string;
	
	    static createFrom(source: any = {}) {
	        return new FinancialSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total_assets = source["total_assets"];
	        this.total_liabilities = source["total_liabilities"];
	        this.net_worth = source["net_worth"];
	        this.monthly_net_flow = source["monthly_net_flow"];
	        this.currency = source["currency"];
	    }
	}
	export class JournalEntry {
	    id: number;
	    transaction_id: number;
	    account_id: number;
	    account_number?: string;
	    account_name?: string;
	    amount: number;
	    entry_type: string;
	    notes?: string;
	
	    static createFrom(source: any = {}) {
	        return new JournalEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.transaction_id = source["transaction_id"];
	        this.account_id = source["account_id"];
	        this.account_number = source["account_number"];
	        this.account_name = source["account_name"];
	        this.amount = source["amount"];
	        this.entry_type = source["entry_type"];
	        this.notes = source["notes"];
	    }
	}
	export class Transaction {
	    id: number;
	    transaction_date: string;
	    description: string;
	    reference_id?: string;
	    created_at: string;
	    entries?: JournalEntry[];
	
	    static createFrom(source: any = {}) {
	        return new Transaction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.transaction_date = source["transaction_date"];
	        this.description = source["description"];
	        this.reference_id = source["reference_id"];
	        this.created_at = source["created_at"];
	        this.entries = this.convertValues(source["entries"], JournalEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

