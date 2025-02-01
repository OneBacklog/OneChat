const { createApp } = Vue

createApp({
  data: () => ({
    form: {},
    settings: { open: false },
    messages: JSON.parse(localStorage.getItem('messages')) || [],
    total_tokens: localStorage.getItem('total_tokens') || 0,
    loading: false,
    input: '',
    models: [
      { name: 'o1', value: 'o1' },
      { name: 'o1 Mini', value: 'o1-mini' },
      { name: 'o3 Mini', value: 'o3-mini' },
      { name: 'DeepSeek R1', value: 'DeepSeek-R1' },
      { name: 'GPT-4o', value: 'gpt-4o' },
      { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
      { name: 'Llama 3.3', value: 'Llama-3.3-70B-Instruct' }
    ]
  }),
  computed: {
    placeholder() {
      return 'Chat with ' + this.models.find(model => model.value === this.settings.model).name
    },
    is_oX() {
      return ['o1', 'o1-mini', 'o3-mini'].includes(this.settings.model)
    },
    is_o1_mini() {
      return this.settings.model === 'o1-mini'
    },
    is_streaming_supported() {
      return ['gpt-4o', 'gpt-4o-mini', 'DeepSeek-R1'].includes(this.settings.model)
    },
    has_small_output() {
      return ['Llama-3.3-70B-Instruct', 'DeepSeek-R1', 'gpt-4o-mini'].includes(this.settings.model)
    }
  },
  created() {
    this.load()
  },
  mounted() {
    this.scroll('start')
  },
  methods: {
    reform() {
      this.form = {
        token: this.settings.token,
        system: this.settings.system,
        model: this.settings.model
      }
    },
    toggle() {
      if (this.settings.open) {
        this.settings.open = false
      } else {
        this.settings.open = true
        this.reform()
      }
    },
    load() {
      this.settings.token = localStorage.getItem('token') || ''
      this.settings.system = localStorage.getItem('system') || ''
      this.settings.model = localStorage.getItem('model') || 'gpt-4o-mini'
    },
    save() {
      if (this.settings.model != this.form.model) this.clear(true)
      localStorage.setItem('system', this.form.system)
      localStorage.setItem('token', this.form.token)
      localStorage.setItem('model', this.form.model)
      this.settings.open = false
      this.load()
    },
    resize(e) {
      const userAgent = navigator.userAgent
      if (userAgent.indexOf("Firefox") > -1 || (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") === -1)) {
        e.target.style.height = 'auto'
        e.target.style.height = e.target.scrollHeight + 'px'
      }
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

      if (!this.is_o1_mini && messages.find(message => message.role == 'system') == undefined) {
        messages.unshift({ role: 'system', content: this.settings.system })
      }

      const data = {
        model: this.settings.model,
        max_completion_tokens: this.has_small_output ? 4096 : 16384,
        temperature: this.is_oX ? 1.0 : 0.7,
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
        content += `<br>You may need GitHub Copilot Pro subscription to use ${model.name}.`
      }

      this.messages[this.messages.length - 1].content = content
      this.scroll('start')
    }
  }
}).mount('body')
