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
      { value: 'gpt-4o-mini', text: 'GPT-4o Mini' },
      { value: 'gpt-4o', text: 'GPT-4o' },
      { value: 'o1-mini', text: 'o1 Mini' },
      { value: 'o1-preview', text: 'o1 Preview' },
      { value: 'Llama-3.3-70B-Instruct', text: 'Llama 3.3' }
    ]
  }),
  computed: {
    placeholder() {
      return 'Chat with ' + this.models.find(model => model.value === this.settings.model).text
    },
    is_o1() {
      return ['o1-mini', 'o1-preview'].includes(this.settings.model)
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

      if (this.is_o1) {
        return {
          max_completion_tokens: 32768,
          model: this.settings.model,
          messages: messages
        }
      } else {
        if (messages.find(message => message.role == 'system') == undefined) {
          messages.unshift({ role: 'system', content: this.settings.system })
        }

        let max_tokens = 16384
        if (this.settings.model == 'Llama-3.3-70B-Instruct') { max_tokens = 4096 }

        return {
          model: this.settings.model,
          max_tokens: max_tokens,
          messages: messages,
          temperature: 0.7
        }
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
            this.messages.push({ role: 'assistant', content: `You may need a GitHub Copilot subscription to use ${model}.` })
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
