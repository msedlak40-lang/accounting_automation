"""Matching logic for Gravity payments to EMR invoices."""

import pandas as pd
from datetime import timedelta
from typing import Tuple


def match_gravity_payments(
    emr_df: pd.DataFrame,
    gravity_df: pd.DataFrame,
    date_tolerance_days: int = 7
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Match Gravity payments to EMR invoices.

    Logic:
    1. Calculate net invoice totals (Total Due - Rewards)
    2. Match Gravity payments by exact amount within ±date_tolerance_days
    3. Return matched and unmatched payments

    Args:
        emr_df: EMR transactions with columns:
                - Invoice #, Date, CID, Name
                - Service/Product, Total Due (for service lines)
                - Payment Type, Amount (for payment lines)
        gravity_df: Gravity payments with columns:
                    - Date, TransactionID, Amount, CardType
        date_tolerance_days: Days before/after to search for matches

    Returns:
        (matched_df, unmatched_df)
    """

    # Step 1: Calculate invoice totals from service lines
    service_lines = emr_df[emr_df['Service/Product'].notna()].copy()

    # Group by invoice - use Name if available, otherwise use customer_id
    group_cols = ['Invoice #', 'Date', 'CID']
    if 'Name' in service_lines.columns:
        group_cols.append('Name')
    elif 'customer_id' in service_lines.columns:
        group_cols.append('customer_id')

    invoice_totals = (
        service_lines.groupby(group_cols)
        .agg({'Total Due': 'sum'})
        .reset_index()
        .rename(columns={'Total Due': 'Service_Total'})
    )

    # Ensure we have a 'Name' column for later use
    if 'Name' not in invoice_totals.columns and 'customer_id' in invoice_totals.columns:
        invoice_totals['Name'] = invoice_totals['customer_id']
    elif 'Name' not in invoice_totals.columns:
        invoice_totals['Name'] = invoice_totals['CID'].astype(str)

    # Step 2: Calculate rewards from payment lines
    reward_types = ['alle rewards', 'aspire awards', 'client bank',
                    'reward points', 'square gift card']

    reward_lines = emr_df[
        emr_df['Payment Type'].notna() &
        emr_df['Payment Type'].str.lower().isin(reward_types)
    ].copy()

    if len(reward_lines) > 0:
        rewards = (
            reward_lines.groupby('Invoice #')
            .agg({'Amount': 'sum'})
            .reset_index()
            .rename(columns={'Amount': 'Rewards'})
        )

        invoice_totals = invoice_totals.merge(rewards, on='Invoice #', how='left')
    else:
        invoice_totals['Rewards'] = 0.0

    invoice_totals['Rewards'] = invoice_totals['Rewards'].fillna(0)

    # Step 3: Calculate net total (what should be paid via Gravity)
    invoice_totals['Net_Total'] = invoice_totals['Service_Total'] - invoice_totals['Rewards']

    print(f"\nInvoice Summary:")
    print(f"  Total invoices: {len(invoice_totals)}")
    print(f"  Invoices with rewards: {(invoice_totals['Rewards'] > 0).sum()}")
    print(f"  Date range: {invoice_totals['Date'].min()} to {invoice_totals['Date'].max()}")

    # Step 4: Match Gravity payments
    matches = []
    unmatched = []

    for _, grav in gravity_df.iterrows():
        # Find candidates: same amount, within date window
        candidates = invoice_totals[
            (invoice_totals['Net_Total'].round(2) == round(grav['Amount'], 2)) &
            (invoice_totals['Date'] >= grav['Date'] - timedelta(days=date_tolerance_days)) &
            (invoice_totals['Date'] <= grav['Date'] + timedelta(days=date_tolerance_days))
        ].copy()

        if len(candidates) == 1:
            # Perfect match
            match = candidates.iloc[0].copy()
            match['TransactionID'] = grav['TransactionID']
            match['Gravity_Date'] = grav['Date']
            match['Amount'] = grav['Amount']
            match['CardType'] = grav['CardType']
            match['Match_Confidence'] = 'high'
            matches.append(match)
        elif len(candidates) > 1:
            # Multiple matches - take closest date
            candidates['date_diff'] = abs((candidates['Date'] - grav['Date']).dt.days)
            best = candidates.nsmallest(1, 'date_diff').iloc[0].copy()
            best['TransactionID'] = grav['TransactionID']
            best['Gravity_Date'] = grav['Date']
            best['Amount'] = grav['Amount']
            best['CardType'] = grav['CardType']
            best['Match_Confidence'] = 'medium'
            matches.append(best)
        else:
            # No match
            unmatched.append(grav)

    matches_df = pd.DataFrame(matches) if matches else pd.DataFrame()
    unmatched_df = pd.DataFrame(unmatched) if unmatched else pd.DataFrame()

    print(f"\nMatching Results:")
    print(f"  Gravity payments: {len(gravity_df)}")
    print(f"  Matched: {len(matches_df)}")
    print(f"  Unmatched: {len(unmatched_df)}")

    if len(matches_df) > 0:
        high_conf = (matches_df['Match_Confidence'] == 'high').sum()
        med_conf = (matches_df['Match_Confidence'] == 'medium').sum()
        print(f"    High confidence: {high_conf}")
        print(f"    Medium confidence: {med_conf}")

    return matches_df, unmatched_df
