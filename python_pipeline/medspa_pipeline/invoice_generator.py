"""Invoice generation for QuickBooks Transaction Pro import."""

import pandas as pd
from pathlib import Path
from typing import Union, Tuple


def load_service_mappings(coa_file: Union[str, Path]) -> pd.DataFrame:
    """
    Load service mappings from COA_Quickbooks_matched.xlsx.

    Args:
        coa_file: Path to COA Excel file with emr_service_items sheet

    Returns:
        DataFrame with columns:
        - Service/Product (EMR service name)
        - Matched_Item (QuickBooks item name)
        - Asset Account
        - Account (income account)
        - Tax Code
    """
    df = pd.read_excel(coa_file, sheet_name='emr_service_items')

    # Clean column names
    df.columns = df.columns.str.strip()

    # Create lookup dictionary for case-insensitive matching
    df['Service/Product_lower'] = df['Service/Product'].str.lower().str.strip()

    return df


def generate_invoices(
    emr_df: pd.DataFrame,
    service_mappings: pd.DataFrame
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Generate invoice import CSV from EMR transactions.

    Logic:
    1. Extract service lines (where Service/Product is not null)
    2. Map EMR service names to QuickBooks items
    3. Format for Transaction Pro Invoice Import

    Args:
        emr_df: EMR transactions with columns:
                - Date, Invoice #, CID, customer_id
                - Service/Product, QTY, Price, Total Due, Tax
        service_mappings: Service mapping DataFrame from load_service_mappings()

    Returns:
        (invoices_df, unmapped_services_df)
        - invoices_df: Ready for Transaction Pro import
        - unmapped_services_df: Services without mappings for review
    """

    # Step 1: Extract service lines only
    service_lines = emr_df[emr_df['Service/Product'].notna()].copy()

    print(f"\nInvoice Generation Summary:")
    print(f"  Total service lines: {len(service_lines)}")
    print(f"  Unique invoices: {service_lines['Invoice #'].nunique()}")
    print(f"  Date range: {service_lines['Date'].min()} to {service_lines['Date'].max()}")

    # Step 2: Map services to QuickBooks items
    service_lines['Service_lower'] = service_lines['Service/Product'].str.lower().str.strip()

    # Create a mapping dictionary
    mapping_dict = dict(zip(
        service_mappings['Service/Product_lower'],
        service_mappings['Matched_Item']
    ))

    # Map the services
    service_lines['QB_Item'] = service_lines['Service_lower'].map(mapping_dict)

    # Identify unmapped services
    unmapped_mask = service_lines['QB_Item'].isna()
    unmapped_services = service_lines[unmapped_mask][['Service/Product']].drop_duplicates()

    if len(unmapped_services) > 0:
        print(f"  ⚠️  Unmapped services: {len(unmapped_services)}")
        print("     (These will be included with service name as item)")

    # For unmapped services, use the original service name as the item
    service_lines.loc[unmapped_mask, 'QB_Item'] = service_lines.loc[unmapped_mask, 'Service/Product']

    # Step 3: Format for Transaction Pro Invoice Import
    invoices = pd.DataFrame({
        'Customer': 'CID-' + service_lines['customer_id'].astype(str),
        'TxnDate': service_lines['Date'].dt.strftime('%Y-%m-%d'),
        'RefNumber': service_lines['Invoice #'],
        'Item': service_lines['QB_Item'],
        'Description': service_lines['Service/Product'],
        'Quantity': service_lines['QTY'].fillna(1.0),
        'Rate': service_lines['Price'].fillna(0.0),
        'Amount': service_lines['Total Due'].fillna(0.0),
        'TaxCode': '',  # Will be populated from mappings if needed
        'Memo': 'EMR | customer_id=' + service_lines['customer_id'].astype(str)
    })

    # Sort by date and invoice number
    invoices = invoices.sort_values(['TxnDate', 'RefNumber'])

    print(f"  ✓ Generated {len(invoices)} invoice lines")
    print(f"  ✓ Covering {invoices['RefNumber'].nunique()} invoices")

    # Prepare unmapped services summary
    if len(unmapped_services) > 0:
        unmapped_df = unmapped_services.copy()
        unmapped_df['Count'] = unmapped_df['Service/Product'].map(
            service_lines[unmapped_mask]['Service/Product'].value_counts()
        )
        unmapped_df = unmapped_df.sort_values('Count', ascending=False)
    else:
        unmapped_df = pd.DataFrame()

    return invoices, unmapped_df


def save_invoices(
    invoices_df: pd.DataFrame,
    output_path: Union[str, Path]
) -> None:
    """
    Save invoice import CSV for Transaction Pro.

    Format:
    - Customer (CID-{customer_id})
    - TxnDate (invoice date)
    - RefNumber (invoice number)
    - Item (QuickBooks item name)
    - Description (EMR service name)
    - Quantity
    - Rate (unit price)
    - Amount (line total)
    - TaxCode
    - Memo (tracking info)
    """
    invoices_df.to_csv(output_path, index=False)
    print(f"✓ Saved {len(invoices_df)} invoice lines to {output_path}")


def save_unmapped_services(
    unmapped_df: pd.DataFrame,
    output_path: Union[str, Path]
) -> None:
    """Save unmapped services report for review."""
    if len(unmapped_df) == 0:
        print("✓ All services mapped successfully!")
        return

    unmapped_df.to_csv(output_path, index=False)
    print(f"⚠️  {len(unmapped_df)} unmapped services saved to {output_path}")
    print("   Add these to COA_Quickbooks_matched.xlsx emr_service_items sheet")
