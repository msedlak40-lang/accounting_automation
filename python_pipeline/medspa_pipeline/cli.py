"""Command-line interface for the Med Spa pipeline."""

import typer
import json
import sys
from pathlib import Path
from rich import print as rprint
from rich.console import Console

from .loaders import (
    load_emr_transactions,
    load_gravity_payments,
    save_receive_payments,
    save_unmatched_gravity
)
from .matchers import match_gravity_payments
from .invoice_generator import (
    load_service_mappings,
    generate_invoices,
    save_invoices,
    save_unmapped_services
)

__version__ = "1.0.0"

app = typer.Typer()
console = Console()


def version_callback(value: bool):
    """Print version and exit."""
    if value:
        print(__version__)
        raise typer.Exit()


@app.callback()
def main(
    version: bool = typer.Option(
        None,
        "--version",
        callback=version_callback,
        is_eager=True,
        help="Show version and exit"
    )
):
    """Med Spa Accounting Pipeline - Match payments and generate invoices."""
    pass


@app.command()
def match(
    emr_file: Path = typer.Option(None, "--emr-file", help="EMR transactions file"),
    gravity_file: Path = typer.Option(None, "--gravity-file", help="Gravity payments CSV file"),
    output: Path = typer.Option(None, "--output", help="Output file path"),
    output_dir: Path = typer.Option("./output", help="Output directory for results"),
    format: str = typer.Option("csv", "--format", help="Output format: csv or json"),
    date_tolerance: int = typer.Option(7, help="Days before/after to match payments"),
    # Legacy positional arguments (for backward compatibility)
    emr_arg: Path = typer.Argument(None, help="EMR transactions file (legacy)"),
    gravity_arg: Path = typer.Argument(None, help="Gravity payments CSV file (legacy)"),
):
    """
    Match Gravity payments to EMR invoices.

    Examples:
        medspa match emr_transactions.xlsx gravity_payments.csv
        medspa match --emr-file emr.xlsx --gravity-file gravity.csv --format json --output matches.json
    """
    # Support both positional and named arguments
    emr_file = emr_file or emr_arg
    gravity_file = gravity_file or gravity_arg

    if not emr_file or not gravity_file:
        console.print("[red]Error: Both EMR and Gravity files are required[/red]")
        raise typer.Exit(1)

    # Suppress console output for JSON format (for Electron integration)
    quiet = format == "json"

    if not quiet:
        console.print("\n[bold blue]Med Spa Payment Matching Pipeline[/bold blue]")
        console.print("=" * 50)

    # Validate inputs
    if not emr_file.exists():
        if not quiet:
            console.print(f"[red]Error: EMR file not found: {emr_file}[/red]")
        raise typer.Exit(1)

    if not gravity_file.exists():
        if not quiet:
            console.print(f"[red]Error: Gravity file not found: {gravity_file}[/red]")
        raise typer.Exit(1)

    # Create output directory if using CSV format
    if format == "csv":
        output_dir.mkdir(parents=True, exist_ok=True)

    if not quiet:
        console.print(f"\n[cyan]Loading data...[/cyan]")
        console.print(f"  EMR: {emr_file}")
        console.print(f"  Gravity: {gravity_file}")

    # Load data
    emr_df = load_emr_transactions(emr_file)
    gravity_df = load_gravity_payments(gravity_file)

    if not quiet:
        console.print(f"\n[cyan]Running matching (±{date_tolerance} days)...[/cyan]")

    # Match payments
    matches_df, unmatched_df = match_gravity_payments(
        emr_df, gravity_df, date_tolerance_days=date_tolerance
    )

    # Handle output based on format
    if format == "json":
        # Convert matches to JSON format for Electron integration
        matches_json = []
        for _, row in matches_df.iterrows():
            matches_json.append({
                "payment_id": str(row.get("payment_id", "")),
                "invoice_number": str(row.get("invoice_number", "")),
                "confidence": 0.9,  # High confidence for exact matches
                "match_reason": "Exact amount and date match",
                "amount": float(row.get("amount", 0)),
                "payment_date": str(row.get("payment_date", "")),
                "invoice_date": str(row.get("invoice_date", "")),
            })

        # Write JSON output
        if output:
            with open(output, 'w') as f:
                json.dump(matches_json, f, indent=2)
        else:
            # Print to stdout for subprocess capture
            print(json.dumps(matches_json, indent=2))
    else:
        # CSV format (original behavior)
        if not quiet:
            console.print(f"\n[cyan]Saving results to {output_dir}/[/cyan]")

        if len(matches_df) > 0:
            receive_payments_path = output_dir / "Receive_Payments_From_Gravity.csv"
            save_receive_payments(matches_df, receive_payments_path)

        if len(unmatched_df) > 0:
            unmatched_path = output_dir / "Unmatched_Gravity_Payments.csv"
            save_unmatched_gravity(unmatched_df, unmatched_path)

        # Summary
        if not quiet:
            console.print(f"\n[bold green]✓ Complete![/bold green]")

            if len(matches_df) == len(gravity_df):
                console.print("[green]All Gravity payments matched successfully![/green]")
            else:
                match_rate = len(matches_df) / len(gravity_df) * 100
                console.print(f"[yellow]Match rate: {match_rate:.1f}%[/yellow]")
                console.print(f"[yellow]Review unmatched payments in: {output_dir}/Unmatched_Gravity_Payments.csv[/yellow]")


@app.command()
def debug(
    emr_file: Path = typer.Argument(..., help="EMR transactions Excel file"),
    invoice_number: str = typer.Argument(..., help="Invoice number to debug"),
):
    """
    Debug a specific invoice to see how it's being calculated.

    Example:
        medspa debug emr_transactions.xlsx 00039889
    """
    console.print(f"\n[bold blue]Debugging Invoice: {invoice_number}[/bold blue]")
    console.print("=" * 50)

    emr_df = load_emr_transactions(emr_file)

    # Get all lines for this invoice
    invoice_lines = emr_df[emr_df['Invoice #'].astype(str) == invoice_number]

    if len(invoice_lines) == 0:
        console.print(f"[red]No lines found for invoice {invoice_number}[/red]")
        return

    console.print(f"\n[cyan]Found {len(invoice_lines)} lines:[/cyan]\n")

    # Service lines
    service_lines = invoice_lines[invoice_lines['Service/Product'].notna()]
    if len(service_lines) > 0:
        console.print("[bold]Service Lines:[/bold]")
        for _, line in service_lines.iterrows():
            console.print(f"  {line['Service/Product']}: Total Due = ${line['Total Due']:.2f}")
        service_total = service_lines['Total Due'].sum()
        console.print(f"  [green]Service Total: ${service_total:.2f}[/green]\n")

    # Payment lines (rewards)
    payment_lines = invoice_lines[invoice_lines['Payment Type'].notna()]
    rewards_total = 0
    if len(payment_lines) > 0:
        console.print("[bold]Payment Lines:[/bold]")
        for _, line in payment_lines.iterrows():
            console.print(f"  {line['Payment Type']}: Amount = ${line['Amount']:.2f}")
            if line['Payment Type'].lower() in ['alle rewards', 'aspire awards', 'client bank', 'reward points', 'square gift card']:
                rewards_total += line['Amount']
        if rewards_total > 0:
            console.print(f"  [yellow]Rewards Total: ${rewards_total:.2f}[/yellow]\n")

    # Net calculation
    if len(service_lines) > 0:
        net_total = service_total - rewards_total
        console.print("[bold]Calculation:[/bold]")
        console.print(f"  ${service_total:.2f} (services) - ${rewards_total:.2f} (rewards) = [green]${net_total:.2f}[/green]")
        console.print(f"\n[bold]This invoice should match a Gravity payment of: ${net_total:.2f}[/bold]")
        console.print(f"[dim]Date: {invoice_lines.iloc[0]['Date']}[/dim]")


@app.command()
def invoices(
    emr_file: Path = typer.Argument(..., help="EMR transactions Excel file"),
    coa_file: Path = typer.Argument(..., help="COA Excel file with service mappings"),
    output_dir: Path = typer.Option("./output", help="Output directory for results"),
):
    """
    Generate invoice import CSV for QuickBooks Transaction Pro.

    This creates invoices for all services performed in the EMR file.

    Example:
        medspa invoices emr_transactions.xlsx COA_Quickbooks_matched.xlsx
    """
    console.print("\n[bold blue]Invoice Generation Pipeline[/bold blue]")
    console.print("=" * 50)

    # Validate inputs
    if not emr_file.exists():
        console.print(f"[red]Error: EMR file not found: {emr_file}[/red]")
        raise typer.Exit(1)

    if not coa_file.exists():
        console.print(f"[red]Error: COA file not found: {coa_file}[/red]")
        raise typer.Exit(1)

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    console.print(f"\n[cyan]Loading data...[/cyan]")
    console.print(f"  EMR: {emr_file}")
    console.print(f"  COA: {coa_file}")

    # Load data
    emr_df = load_emr_transactions(emr_file)
    service_mappings = load_service_mappings(coa_file)

    console.print(f"\n[cyan]Generating invoices...[/cyan]")
    console.print(f"  Service mappings loaded: {len(service_mappings)}")

    # Generate invoices
    invoices_df, unmapped_df = generate_invoices(emr_df, service_mappings)

    # Save outputs
    console.print(f"\n[cyan]Saving results to {output_dir}/[/cyan]")

    invoice_path = output_dir / "Invoice_Import_ItemBased.csv"
    save_invoices(invoices_df, invoice_path)

    if len(unmapped_df) > 0:
        unmapped_path = output_dir / "Unmapped_Services.csv"
        save_unmapped_services(unmapped_df, unmapped_path)

    # Summary
    console.print(f"\n[bold green]✓ Complete![/bold green]")
    console.print(f"[green]Generated invoices ready for Transaction Pro import:[/green]")
    console.print(f"[green]  {invoice_path}[/green]")

    if len(unmapped_df) > 0:
        console.print(f"\n[yellow]⚠️  {len(unmapped_df)} services need mapping:[/yellow]")
        console.print(f"[yellow]  Review: {output_dir}/Unmapped_Services.csv[/yellow]")
        console.print(f"[yellow]  Add to: {coa_file} (emr_service_items sheet)[/yellow]")
    else:
        console.print(f"[green]All services mapped successfully![/green]")


@app.command(name="generate-invoices")
def generate_invoices_cmd(
    emr_file: Path = typer.Option(None, "--emr-file", help="EMR transactions file"),
    output: Path = typer.Option(None, "--output", help="Output file path"),
    format: str = typer.Option("csv", "--format", help="Output format: csv or json"),
    coa_file: Path = typer.Option(None, "--coa-file", help="COA Excel file with service mappings"),
    output_dir: Path = typer.Option("./output", help="Output directory for CSV results"),
):
    """
    Generate invoices from EMR transactions (Electron-compatible).

    For Electron integration with JSON output:
        medspa generate-invoices --emr-file emr.xlsx --output invoices.json --format json

    For standalone CSV generation:
        medspa generate-invoices --emr-file emr.xlsx --coa-file coa.xlsx
    """
    if not emr_file or not emr_file.exists():
        console.print("[red]Error: EMR file is required and must exist[/red]")
        raise typer.Exit(1)

    # Suppress console output for JSON format
    quiet = format == "json"

    if not quiet:
        console.print("\n[bold blue]Invoice Generation Pipeline[/bold blue]")
        console.print("=" * 50)
        console.print(f"\n[cyan]Loading data...[/cyan]")
        console.print(f"  EMR: {emr_file}")

    # Load EMR data
    emr_df = load_emr_transactions(emr_file)

    if format == "json":
        # For Electron integration: generate simplified invoice data
        # Group by invoice number and create structured output
        invoices_json = []

        # Get service lines only
        service_lines = emr_df[emr_df['Service/Product'].notna()].copy()

        # Group by invoice
        for invoice_num, group in service_lines.groupby('Invoice #'):
            line_items = []
            for _, row in group.iterrows():
                line_items.append({
                    "service": str(row.get('Service/Product', '')),
                    "quantity": int(row.get('QTY', 1)),
                    "price": float(row.get('Price', 0)),
                    "total": float(row.get('Total Due', 0)),
                })

            invoices_json.append({
                "invoice_number": str(invoice_num),
                "customer_id": str(group.iloc[0].get('CID', '')),
                "date": str(group.iloc[0].get('Date', '')),
                "line_items": line_items,
                "total": float(group['Total Due'].sum()),
            })

        # Write JSON output
        if output:
            with open(output, 'w') as f:
                json.dump(invoices_json, f, indent=2)
        else:
            print(json.dumps(invoices_json, indent=2))

    else:
        # CSV format: requires COA file for service mappings
        if not coa_file or not coa_file.exists():
            console.print("[red]Error: COA file is required for CSV generation[/red]")
            raise typer.Exit(1)

        output_dir.mkdir(parents=True, exist_ok=True)

        if not quiet:
            console.print(f"  COA: {coa_file}")

        # Load service mappings
        service_mappings = load_service_mappings(coa_file)

        if not quiet:
            console.print(f"\n[cyan]Generating invoices...[/cyan]")
            console.print(f"  Service mappings loaded: {len(service_mappings)}")

        # Generate invoices
        invoices_df, unmapped_df = generate_invoices(emr_df, service_mappings)

        # Save outputs
        if not quiet:
            console.print(f"\n[cyan]Saving results to {output_dir}/[/cyan]")

        invoice_path = output_dir / "Invoice_Import_ItemBased.csv"
        save_invoices(invoices_df, invoice_path)

        if len(unmapped_df) > 0:
            unmapped_path = output_dir / "Unmapped_Services.csv"
            save_unmapped_services(unmapped_df, unmapped_path)

        # Summary
        if not quiet:
            console.print(f"\n[bold green]✓ Complete![/bold green]")
            console.print(f"[green]Generated invoices ready for Transaction Pro import:[/green]")
            console.print(f"[green]  {invoice_path}[/green]")

            if len(unmapped_df) > 0:
                console.print(f"\n[yellow]⚠️  {len(unmapped_df)} services need mapping:[/yellow]")
                console.print(f"[yellow]  Review: {output_dir}/Unmapped_Services.csv[/yellow]")
            else:
                console.print(f"[green]All services mapped successfully![/green]")


if __name__ == "__main__":
    app()
