import re

def process():
    with open('train_model.py', 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    out_lines = []
    skip = False
    for line in lines:
        if "# ═══════════════════════════════════════════════════════════" in line and "WOE (Weight of Evidence) BINNING" in ''.join(lines[lines.index(line):lines.index(line)+3]):
            skip = True
        if skip and "# ═══════════════════════════════════════════════════════════" in line and "DATA LOADING" in ''.join(lines[lines.index(line):lines.index(line)+3]):
            skip = False
            
        if "# ═══════════════════════════════════════════════════════════" in line and "LIGHTGBM MODEL BUILDERS" in ''.join(lines[lines.index(line):lines.index(line)+3]):
            skip = True
        # Let's just keep everything except the blocks we definitely want to skip.
        # Actually doing this line by line is risky because chunking logic might break.
    pass

if __name__ == '__main__':
    process()
