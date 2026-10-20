import json
import re
from pathlib import Path


def extract_cpu_family(cpu_name):
    """Extracts short CPU indicators like I7, I5, M3, R7, etc."""
    if not cpu_name or not isinstance(cpu_name, str):
        return "CPU"

    cpu_name_upper = cpu_name.upper()

    # Match common Intel/AMD/Apple patterns (e.g., i7-1255U -> I7, Ryzen 7 -> R7)
    match_intel_amd = re.search(r"\b([IR][3579])\b", cpu_name_upper)
    if match_intel_amd:
        return match_intel_amd.group(1)

    # Apple M-chips
    match_apple = re.search(r"\b(M[1234]\s*(?:PRO|MAX|ULTRA)?)\b", cpu_name_upper)
    if match_apple:
        return match_apple.group(1).replace(" ", "")

    return "CPU"


def generate_store_sku(laptop):
    """Generates a structured SKU based on actual laptop specs."""
    # 1. Manufacturer (First 3 letters, e.g., LENOVO -> LEN)
    mfg = laptop.get("Manufacturer", "GEN")[:3].upper()

    # 2. CPU Family (e.g., Core i7 -> I7)
    cpu_raw = laptop.get("CpuName", "")
    cpu_code = extract_cpu_family(cpu_raw)

    # 3. RAM (e.g., 8GB -> 8G)
    ram = laptop.get("RamTotalGB", "0")
    ram_code = f"{ram}G"

    # 4. Main Disk Info (e.g., 476.94 GB SSD -> 476SSD)
    disk_code = "HDD"
    disks = laptop.get("Disks", [])
    if disks and isinstance(disks, list):
        primary_disk = disks[0]
        size = int(float(primary_disk.get("SizeGB", 0)))
        dtype = primary_disk.get("Type", "SSD").upper()
        disk_code = f"{size}{dtype}"

    return f"{mfg}-{cpu_code}-{ram_code}-{disk_code}"


def process_inventory(input_file, output_file):
    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Wrap in a list if the JSON is just a single dictionary
    if isinstance(data, dict):
        data = [data]

    modified_data = []
    sku_counters = {}

    for item in data:
        # Generate the descriptive SKU base
        base_sku = generate_store_sku(item)

        # Track duplicates of identical specs to append a sequential counter
        sku_counters[base_sku] = sku_counters.get(base_sku, 0) + 1
        sequence = f"{sku_counters[base_sku]:02d}"

        final_sku = f"{base_sku}-{sequence}"

        # Clean out any old/random "id" field if it exists, and make final_sku the new ID
        filtered_item = {k: v for k, v in item.items() if k.lower() != "id"}

        # Put the new SKU-based ID at the very top
        ordered_item = {"id": final_sku, **filtered_item}
        modified_data.append(ordered_item)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(modified_data, f, indent=4)

    print(f"Processed! Check the top of your JSON items in '{output_file}'.")


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    process_inventory(
        project_root / "database" / "laptops.json",
        project_root / "database" / "output.json",
    )