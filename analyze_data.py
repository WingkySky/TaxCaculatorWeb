#!/usr/bin/env python3

import xlrd
from datetime import datetime

wb = xlrd.open_workbook('发放明细.xls')
ws = wb.sheet_by_index(0)

# Get header (row 2)
headers = ws.row_values(2)
print("Headers:", headers)
print()

# Process data
data = []
for row_idx in range(3, ws.nrows):
    row = ws.row_values(row_idx)
    if len(row) < len(headers):
        row += [''] * (len(headers) - len(row))
    
    record = dict(zip(headers, row))
    data.append(record)

print(f"Total records: {len(data)}")
print()

# Analyze by person
from collections import defaultdict
person_records = defaultdict(list)
for record in data:
    if record['状态'] in ['已打款']:  # Only consider paid records
        person_records[record['身份证']].append(record)

for person_id, records in person_records.items():
    print(f"=== 身份证: {person_id}, 姓名: {records[0]['姓名']} ===")
    # Sort records by create time or update time
    records_sorted = sorted(records, key=lambda r: r['创建时间'] or r['更新时间'] or '')
    for r in records_sorted:
        # Extract month from time
        time_str = r['创建时间'] or r['更新时间']
        month = ''
        if time_str:
            try:
                # Try to parse
                if ' ' in time_str:
                    date_part = time_str.split()[0]
                    if '-' in date_part:
                        y, m, d = date_part.split('-')[:3]
                        month = f"{y}-{m.zfill(2)}"
            except:
                pass
        
        print(f"  创建时间: {r['创建时间']} → 月份: {month} | 税前: {r['税前金额']}, 个税: {r['个税金额']}, 税后: {r['税后金额']} | 状态: {r['状态']}")
    print()
