# OneChat

Focused Chat UI for GitHub Models

### Features

- Simple, Minimalist and Lightweight
- Custom System Instructions Support
- Available on iOS and Android as PWA

### Models

##### Open Source

- DeepSeek R1
- Llama 3.3

##### Proprietary

- o1*
- o1-Mini*
- o3-Mini*
- GPT-4o
- GPT-4o Mini
- Command R
- Command R+

\* You may need GitHub Copilot Pro subscription to use o1/o3 models.

### System Instructions

Each model has its own separate message history and custom system instructions. You can use them based on their capabilities, for example; the o1/o3/R1 models for complex reasoning tasks, the 4o/Llama for simple questions, or the Command R for working with languages, such as grammar or translations.

### Dependencies

OneChat was built by slapping VueJS, MarkedJS and PicoCSS to a HTML file, so it doesn't require specific runtime or build process. You can run it yourself by opening the `index.html` file directly on any web browsers.

### Privacy

OneChat is a 100% client-side app that directly communicates with the GitHub Models Inference API; therefore, it has no backend server and everything is stored in your web browser's Local Storage.
