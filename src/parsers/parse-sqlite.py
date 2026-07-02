import os
import sqlite3
import datetime
import json
import sys

def decode_varint(data, pos):
    val = 0
    shift = 0
    while True:
        if pos >= len(data):
            raise IndexError("Varint overflow")
        b = data[pos]
        pos += 1
        val |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    return val, pos

def parse_proto_to_dict(data, pos=0, end=None):
    res = {}
    if end is None:
        end = len(data)
    while pos < end:
        try:
            key, pos = decode_varint(data, pos)
        except IndexError:
            break
        wire_type = key & 7
        field_num = key >> 3
        if wire_type == 0:
            try:
                val, pos = decode_varint(data, pos)
                res[field_num] = val
            except IndexError:
                break
        elif wire_type == 1:
            if pos + 8 > len(data):
                break
            val = int.from_bytes(data[pos:pos+8], 'little')
            pos += 8
            res[field_num] = val
        elif wire_type == 2:
            try:
                length, pos = decode_varint(data, pos)
            except IndexError:
                break
            if pos + length > len(data):
                break
            val = data[pos:pos+length]
            pos += length
            sub = parse_proto_to_dict(val, 0, len(val))
            if sub:
                res[field_num] = sub
            else:
                try:
                    res[field_num] = val.decode('utf-8')
                except UnicodeDecodeError:
                    res[field_num] = val
        elif wire_type == 5:
            if pos + 4 > len(data):
                break
            val = int.from_bytes(data[pos:pos+4], 'little')
            pos += 4
            res[field_num] = val
        else:
            break
    return res

def main():
    if len(sys.argv) < 2:
        print(json.dumps({}))
        return

    agy_dir = sys.argv[1]
    conv_dir = os.path.join(agy_dir, "conversations")
    if not os.path.exists(conv_dir):
        print(json.dumps({}))
        return

    daily_usage = {}

    for file in os.listdir(conv_dir):
        if file.endswith('.db'):
            db_path = os.path.join(conv_dir, file)
            try:
                # Open read-only and allow access even if another process is writing
                conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
                cursor = conn.cursor()
                cursor.execute('SELECT metadata FROM steps WHERE metadata IS NOT NULL')
                for (blob,) in cursor.fetchall():
                    try:
                        parsed = parse_proto_to_dict(blob)
                        # Extract timestamp from 1.1
                        f1 = parsed.get(1)
                        ts = None
                        if isinstance(f1, dict):
                            ts = f1.get(1)
                        
                        if not ts:
                            continue
                            
                        # Extract token usage from 9
                        f9 = parsed.get(9)
                        if isinstance(f9, dict):
                            input_tok = f9.get(2, 0)
                            output_tok = f9.get(3, 0)
                            cache_tok = f9.get(5, 0)
                            
                            if input_tok > 0 or output_tok > 0 or cache_tok > 0:
                                # Parse as UTC date
                                dt = datetime.datetime.fromtimestamp(ts, datetime.timezone.utc)
                                date_str = dt.date().isoformat()
                                if date_str not in daily_usage:
                                    daily_usage[date_str] = {'input': 0, 'output': 0, 'cacheRead': 0}
                                daily_usage[date_str]['input'] += input_tok
                                daily_usage[date_str]['output'] += output_tok
                                daily_usage[date_str]['cacheRead'] += cache_tok
                    except Exception:
                        pass
                conn.close()
            except Exception:
                pass

    print(json.dumps(daily_usage))

if __name__ == "__main__":
    main()
