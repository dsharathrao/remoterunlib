from remoterunlib import Dashboard

client = Dashboard(host='localhost', port=8000)

client.serve()
