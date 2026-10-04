# Month-end cash reconciliation procedure (SYNTHETIC)

1. Extract GL cash balances for the period from the Ledger API.
2. Pull Treasury reference data (FX rates, nostro positions).
3. Run the reconciliation engine and review exceptions.
4. Publish the exceptions report to the Internal Finance share.
