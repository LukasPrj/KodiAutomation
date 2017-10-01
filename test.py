from api import RadioApi

print 'Get Instance'
ra = RadioApi()

results = ra.search_stations_by_string('WDR') 
print results
sys.stdout.flush()
