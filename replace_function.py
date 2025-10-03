#!/usr/bin/env python3

import re

# Read the file
with open('backend/app/stg_parser.py', 'r') as f:
    content = f.read()

# Find the start and end of the function
lines = content.split('\n')
start_line = None
end_line = None

for i, line in enumerate(lines):
    if 'def _read_table_flex(path: Path) -> pd.DataFrame:' in line:
        start_line = i
    elif start_line is not None and line.strip() == ')' and i > start_line + 10:
        # Check if this is the end of the raise ValueError
        if any('raise ValueError' in lines[j] for j in range(max(0, i-5), i)):
            end_line = i
            break

if start_line is not None and end_line is not None:
    print(f"Found function from line {start_line} to {end_line}")
    
    # Create the new function
    new_function = '''def _read_table_flex(path: Path) -> pd.DataFrame:
    """
    Try ',', ';', '\\t', then whitespace. Return a DataFrame or raise ValueError.
    """
    last_err: Optional[Exception] = None
    
    # First, try to skip comment lines that start with * or #
    def _skip_comments(file_path):
        lines = []
        with open(file_path, 'r', encoding='latin-1', errors='ignore') as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith('*') and not stripped.startswith('#'):
                    lines.append(line)
        return '\\n'.join(lines)
    
    content = _skip_comments(path)
    
    for sep in [",", ";", "\\t"]:
        try:
            df = pd.read_csv(io.StringIO(content), sep=sep, engine="c")
            # Check if we got reasonable columns (more than 1 column expected)
            if len(df) > 0 and len(df.columns) >= 4:
                return df
        except Exception as e:
            last_err = e
    try:
        # pandas recommends sep='\\s+' instead of delim_whitespace
        df = pd.read_csv(io.StringIO(content), sep=r"\\s+", engine="python")
        return df
    except Exception as e:
        raise ValueError(
            "Could not parse table with ',', ';', '\\t', or whitespace. "
            f"Attempts: [\\"sep=',' -> {repr(last_err)}\\", \\"sep=';'\\", \\"sep='\\t'\\"]"
        )'''
    
    # Replace the lines
    new_lines = lines[:start_line] + new_function.split('\n') + lines[end_line+1:]
    
    # Write back to file
    with open('backend/app/stg_parser.py', 'w') as f:
        f.write('\n'.join(new_lines))
    
    print('Function replaced successfully')
else:
    print('Could not find function boundaries')
    print(f"start_line: {start_line}, end_line: {end_line}")