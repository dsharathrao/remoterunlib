from remoterunlib import SSHClient

# Example: Manage Docker containers/images on localhost
if __name__ == "__main__":
    client = SSHClient(hostname="localhost", username="your_username", password="your_password")
    client.login()

    # List Docker containers
    containers = client.docker_list_containers()
    print("Containers:", containers)

    # List Docker images
    images = client.docker_list_images()
    print("Images:", images)

    # Start a container
    result = client.docker_start_container(container_id_or_name="my_container")
    print("Start container result:", result)

    # Stop a container
    result = client.docker_stop_container(container_id_or_name="my_container")
    print("Stop container result:", result)

    # Remove a container
    result = client.docker_remove_container(container_id_or_name="my_container")
    print("Remove container result:", result)

    # Remove an image
    result = client.docker_remove_image(image_id_or_name="my_image")
    print("Remove image result:", result)

    client.close()
