"""Command-line interface for the Med Spa pipeline."""

import typer
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

app = typer.Typer()
console = Console()


@app.command()
def match(
    emr_file: Path = typer.Argument(..., help="EMR transactions Excel file"),
    gravity_file: Path = typer.Argument(..., help="Gravity payments CSV file"),
    output_dir: Path = typer.Option("./output", help="Output directory for results"),
    date_tolerance: int = typer.Option(7, help="Days before/after to match payments"),
):
    """
    Match Gravity payments to EMR invoices.

    Example:
        medspa match emr_transactions.xlsx gravity_payments.csv
    """
    console.print("\n[bold blue]Med Spa Payment Matching Pipeline[/bold blue]")
    console.print("=" * 50)

    # Validate inputs
    if not emr_file.exists():
        console.print(f"[red]Error: EMR file not found: {emr_file}[/red]")
        raise typer.Exit(1)

    if not gravity_file.exists():
        console.print(f"[red]Error: Gravity file not found: {gravity_file}[/red]")
        raise typer.Exit(1)

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    console.print(f"\n[cyan]Loading data...[/cyan]")
    console.print(f"  EMR: {emr_file}")
    console.print(f"  Gravity: {gravity_file}")

    # Load data
    emr_df = load_emr_transactions(emr_file)
    gravity_df = load_gravity_payments(gravity_file)

    console.print(f"\n[cyan]Running matching (±{date_tolerance} days)...[/cyan]")

    # Match payments
    matches_df, unmatched_df = match_gravity_payments(
        emr_df, gravity_df, date_tolerance_days=date_tolerance
    )

    # Save outputs
    console.print(f"\n[cyan]Saving results to {output_dir}/[/cyan]")

    if len(matches_df) > 0:
        receive_payments_path = output_dir / "Receive_Payments_From_Gravity.csv"
        save_receive_payments(matches_df, receive_payments_path)

    if len(unmatched_df) > 0:
        unmatched_path = output_dir / "Unmatched_Gravity_Payments.csv"
        save_unmatched_gravity(unmatched_df, unmatched_path)

    # Summary
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


if __name__ == "__main__":
    app()
