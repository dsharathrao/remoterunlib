
from remoterunlib import SSHClient

if __name__ == "__main__":
    client = SSHClient(hostname="localhost", username="your_username", password="your_password")
    client.login()

    # List Docker containers and images
    print(client.docker_list_containers())
    print(client.docker_list_images())

    # Start/Stop/Remove a container
    client.docker_start_container("my_container")
    client.docker_stop_container("my_container")
    client.docker_remove_container("my_container")

    # Remove an image
    client.docker_remove_image("my_image")

    # Run Docker Compose project
    client.docker_compose_project_action("docker-compose.yml", action="up", detach=True)

    client.close()
