import json
from pathlib import Path

project_root = Path(__file__).resolve().parents[1]
input_file = project_root / "database" / "laptops.json"
output_file = project_root / "database" / "laptops_updated.json"

# The two empty keys you want to add
new_keys = {
    "notes": "",  # Saves as null in JSON. Use "" for empty strings instead.
}

try:
    # 1. Load the existing JSON data
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 2. Add the keys to each item
    # This assumes your JSON root is a list of dictionaries
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict):
                # Update the item with the new keys if they don't already exist
                for key, default_value in new_keys.items():
                    item.setdefault(key, default_value)
    elif isinstance(data, dict):
        # If your JSON is a single dictionary instead of a list
        for key, default_value in new_keys.items():
            data.setdefault(key, default_value)
    else:
        print("Error: JSON root is neither a list nor a dictionary.")
        exit()

    # 3. Save the modified data back to a file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        
    print(f"Successfully added keys and saved to '{output_file}'!")

except FileNotFoundError:
    print(f"Error: The file '{input_file}' was not found.")
except json.JSONDecodeError:
    print("Error: Failed to decode JSON. Please check if your file is valid.")