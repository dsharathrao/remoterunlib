
from remoterunlib import Dashboard

if __name__ == "__main__":
    dashboard = Dashboard(host='localhost', port=8000)
    dashboard.serve()  # Starts the Flask dashboard
