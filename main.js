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
    },
    is_streaming_supported() {
      return ['gpt-4o', 'gpt-4o-mini', 'DeepSeek-R1'].includes(this.settings.model)
    },
    is_small_model() {
      return ['Llama-3.3-70B-Instruct', 'DeepSeek-R1'].includes(this.settings.model)
    }
  },
  mounted() {
    this.scroll('start')
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
    scroll(block='end') {
      setTimeout(() => document.querySelector("ul#chat > li:last-child")?.scrollIntoView({ behavior: 'smooth', block: block }))
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

      const data = {
        model: this.settings.model,
        max_completion_tokens: this.is_small_model ? 4096 : 16384,
        temperature: this.is_o1 ? 1.0 : 0.7,
        messages: messages
      }

      if (this.is_streaming_supported) {
        return { ...data, stream: true, stream_options: { include_usage: true } }
      } else {
        return data
      }
    },
    async chat() {
      this.messages.push({ role: 'assistant', content: 'Thinking...' })

      const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.token}`
        },
        body: JSON.stringify(this.payload())
      })

      this.is_streaming_supported ? await this.stream(response) : await this.parse(response)

      this.updateLocalStorage()
      this.loading = false
      this.input = ''
    },
    async parse(response) {
      await response.json().then(data => {
        if (response.status == 200) {
          this.messages[this.messages.length - 1].content = marked.parse(data.choices[0].message.content)
          this.total_tokens = data.usage.total_tokens
          this.scroll('start')
        } else {
          this.error(data)
        }
      })
    },
    async stream(response) {
      if (response.status == 200) {
        this.messages[this.messages.length - 1].content = ''
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let content = ''
        let partial = ''

        while(true) {
          const { done, value } = await reader.read()
          if (done) break
          content = decoder.decode(value, { stream: true })

          content.split('data: ').forEach(chunk => {
            try {
              const data = JSON.parse(partial + chunk)
              partial = ''

              if (data.usage?.total_tokens) this.total_tokens = data.usage.total_tokens
              if (!data.choices[0].delta.content) return

              this.messages[this.messages.length - 1].content += data.choices[0].delta.content
              this.scroll()
            }
            catch (error) {
              partial = chunk
            }
          })
        }

        const answer = this.messages[this.messages.length - 1]
        answer.content = marked.parse(answer.content)
        this.scroll()
      } else {
        response.json().then(data => this.error(data))
      }
    },
    async error(data) {
      let content = '[Error] ' + data.error.message

      if (data.error.code == 'unavailable_model') {
        const model = this.models.find(model => model.value === this.settings.model)
        content += `<br>You may need a GitHub Copilot Pro to use ${model.text}.`
      }

      this.messages[this.messages.length - 1].content = content
      this.scroll('start')
    }
  }
}).mount('body')
