const { createApp } = Vue

createApp({
  data: () => ({
    open: false,
    settings: {
      token: localStorage.getItem('token') || '',
      system: localStorage.getItem('system') || '',
      model: localStorage.getItem('model') || 'gpt-4o-mini'
    },
    messages: JSON.parse(localStorage.getItem('messages')) || [],
    total_tokens: localStorage.getItem('total_tokens') || 0,
    loading: false,
    input: '',
    models: [
      { value: 'o1', text: 'o1' },
      { value: 'o1-mini', text: 'o1 Mini' },
      { value: 'DeepSeek-R1', text: 'DeepSeek R1' },
      { value: 'gpt-4o', text: 'GPT-4o' },
      { value: 'gpt-4o-mini', text: 'GPT-4o Mini' },
      { value: 'Llama-3.3-70B-Instruct', text: 'Llama 3.3' }
    ]
  }),
  computed: {
    placeholder() {
      return 'Chat with ' + this.models.find(model => model.value === this.settings.model).text
    },
    is_o1() {
      return ['o1', 'o1-mini'].includes(this.settings.model)
    },
    is_reasoning() {
      return this.settings.model == 'DeepSeek-R1' || this.is_o1
    }
  },
  mounted() {
    this.scroll()
  },
  methods: {
    toggle() {
      this.open = !this.open
    },
    save() {
      if (localStorage.getItem('model') != this.settings.model) this.clear(true)
      localStorage.setItem('system', this.settings.system)
      localStorage.setItem('token', this.settings.token)
      localStorage.setItem('model', this.settings.model)
      this.open = false
    },
    scroll() {
      setTimeout(() => document.querySelector("ul#chat > li:last-child")?.scrollIntoView())
    },
    clear(force=false) {
      if (force || confirm('Clear Conversation?')) {
        this.messages = []
        this.total_tokens = 0
        this.updateLocalStorage()
      }
    },
    updateLocalStorage() {
      localStorage.setItem('messages', JSON.stringify(this.messages))
      localStorage.setItem('total_tokens', this.total_tokens)
    },
    send() {
      if (this.loading || !this.settings.token) return
      this.messages.push({ role: 'user', content: this.input })
      this.loading = true
      this.scroll()
      this.chat()
    },
    payload() {
      const messages = this.messages.slice(-7)

      if (!this.is_reasoning && messages.find(message => message.role == 'system') == undefined) {
        messages.unshift({ role: 'system', content: this.settings.system })
      }

      let max_tokens = 16384
      if (['Llama-3.3-70B-Instruct', 'DeepSeek-R1'].includes(this.settings.model)) { max_tokens = 4096 }

      return {
        messages: messages,
        model: this.settings.model,
        max_completion_tokens: max_tokens,
        temperature: this.is_o1 ? 1.0 : 0.7
      }
    },
    chat() {
      fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.token}`
        },
        body: JSON.stringify(this.payload())
      })
      .then(response => response.json().then(data => {
        if (response.status == 200) {
          this.total_tokens = data.usage.total_tokens
          this.messages.push({ role: 'assistant', content: marked.parse(data.choices[0].message.content) })
        } else {
          this.messages.push({ role: 'assistant', content: `Error: ${data.error.message}` })
          if (data.error.code == 'unavailable_model') {
            const model = this.models.find(model => model.value === this.settings.model)
            this.messages.push({ role: 'assistant', content: `You may need a GitHub Copilot subscription to use ${model.text}.` })
          }
        }
        this.scroll()
        this.input = ''
        this.loading = false
        this.updateLocalStorage()
      }))
    }
  }
}).mount('body')
