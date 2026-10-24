import urllib.request
import json

url = 'https://router.project-osrm.org/route/v1/driving/76.2999,9.9816;76.3516,10.1076?overview=full&geometries=geojson&steps=true'
req = urllib.request.Request(url, headers={'User-Agent': 'ResQNet-Flood-Intelligence/2.0'})

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode())
        print('OSRM Status code:', data.get('code'))
        if data.get('code') == 'Ok':
            r = data['routes'][0]
            dist_km = r['distance'] / 1000.0
            dur_min = r['duration'] / 60.0
            coords = r['geometry']['coordinates']
            steps = r['legs'][0]['steps']
            print(f'Distance: {dist_km:.2f} km')
            print(f'Duration: {dur_min:.1f} mins')
            print(f'Num geometry coords: {len(coords)}')
            print(f'Num steps: {len(steps)}')
            for i, s in enumerate(steps[:4]):
                m = s.get('maneuver', {})
                print(f"Step {i+1}: {m.get('type')} {m.get('modifier', '')} onto '{s.get('name', 'unnamed')}' ({s.get('distance', 0):.0f}m)")
except Exception as e:
    print('OSRM request error:', e)
