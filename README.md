# Data Extension Import Ease

Data Extension Import Ease is an application designed to simplify the conversion of CSV/TXT files into Salesforce Marketing Cloud Data Extensions. With a user-friendly interface, the app provides a seamless drag-and-drop functionality, empowering users with an informative dashboard for efficient data extension creation.

## Key Features

- **Header Retrieval**: Automatically extracts field names from CSV/TXT file headers.
- **Field Type Mapping**: Intelligently determines field types based on data patterns.
- **Import Feedback**: Offers insights on file attributes such as encoding and column consistency.
- **Large-File Flexibility**: Optimized for large files, with a default limit of 2 MB, adjustable based on user requirements.
- **Robust Error Handling**: Manages incorrect file formats and size limitations gracefully.
- **Field Customization**: Users can reorder, add, or remove fields, and adjust field types directly from the dashboard.
- **Efficient Data Extension Creation**: Utilizes a "Go Back" feature to rapidly create multiple Data Extensions without data loss.

![Screenshot](/app_images/1.png)

![Screenshot](/app_images/2.png)

![Screenshot](/app_images/3.png)

![Screenshot](/app_images/4.png)

![Screenshot](/app_images/5.png)

![Screenshot](/app_images/6.png)

## Getting Started

This application is developed for Heroku-hosted deployments, complementing Salesforce Marketing Cloud (SFMC) integration.

### Salesforce Marketing Cloud Setup

1. Create a Web App package with "Write" permissions under the "Data Extensions" section in SFMC.
2. Set the redirect URI to `https://yourherokudomain.herokuapp.com`.

For SFMC UI integration:

- Configure the "Login Endpoint" to `https://yourherokudomain.herokuapp.com/initiate-authorization/`.
- The "Logout Endpoint" can point to `https://yourherokudomain.herokuapp.com/log-out/`, though this URL is placeholder and should be customized as needed.

![Screenshot](/instruction_images/sfmc.jpg)

### Heroku Configuration

After deploying the app via a GitHub repository:

- Define the necessary configuration variables within Heroku's settings to match the SFMC package details.

![Screenshot](/instruction_images/heroku.png)

With these configurations, the app is ready for use.

## License

Data Extension Import Ease is open-sourced under the MIT License. See the LICENSE file for more details.

## Thanks

I extend my deepest gratitude to Alexander Mellbin and Erik Ivarsson for their unwavering support throughout this entire journey. For the invaluable insights into the UI, special thanks go to Isabella Enryd, whose feedback was instrumental in refining the user experience.

---
