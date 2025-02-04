const { createApp } = Vue

createApp({
  data: () => ({
    form: {},
    messages: [],
    settings: { open: false, select: false },
    total_tokens: 0,
    loading: false,
    input: '',
    models: [
      { name: 'o1', value: 'o1' },
      { name: 'o1 Mini', value: 'o1-mini' },
      { name: 'o3 Mini', value: 'o3-mini' },
      { name: 'DeepSeek R1', value: 'DeepSeek-R1' },
      { name: 'GPT-4o', value: 'gpt-4o' },
      { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
      { name: 'Command R', value: 'Cohere-command-r' },
      { name: 'Command R+', value: 'Cohere-command-r-plus' },
      { name: 'Llama 3.3', value: 'Llama-3.3-70B-Instruct' }
    ]
  }),
  computed: {
    placeholder() {
      return 'Chat with ' + this.models.find(model => model.value == this.settings.model).name
    },
    is_oX() {
      return ['o1', 'o1-mini', 'o3-mini'].includes(this.settings.model)
    },
    is_r1() {
      return this.settings.model == 'DeepSeek-R1'
    },
    is_instruction_unsupported() {
      return ['o1-mini', 'DeepSeek-R1'].includes(this.form.model)
    },
    is_streaming_unsupported() {
      return this.is_oX || this.settings.model == 'Llama-3.3-70B-Instruct'
    },
    has_large_tokens() {
      return this.is_oX || this.settings.model == 'gpt-4o'
    }
  },
  created() {
    this.loadSettings()
    this.loadData()
    this.loadForm()
  },
  mounted() {
    this.scroll('start')
  },
  watch: {
    "settings.model"(value) {
      if (this.settings.select) {
        localStorage.setItem('model', value)
        this.settings.select = false
        this.$refs.prompt.focus()
        this.loadData()
      }
    }
  },
  methods: {
    toggle() {
      if (this.settings.open) {
        this.settings.open = false
      } else {
        this.settings.open = true
        this.loadForm()
      }
    },
    loadSettings() {
      this.settings.token = localStorage.getItem('token') || ''
      this.settings.model = localStorage.getItem('model') || 'gpt-4o-mini'
      this.settings.system = JSON.parse(localStorage.getItem('system')) || {}
    },
    loadData() {
      this.total_tokens = localStorage.getItem('total_tokens_' + this.settings.model) || 0
      this.messages = JSON.parse(localStorage.getItem('messages_' + this.settings.model)) || []
    },
    loadForm() {
      this.form = {
        token: this.settings.token,
        system: this.settings.system,
        model: this.settings.model
      }
    },
    save() {
      localStorage.setItem('system', JSON.stringify(this.form.system))
      localStorage.setItem('token', this.form.token)
      localStorage.setItem('model', this.form.model)
      this.settings.open = false
      this.loadSettings()
      this.loadData()
    },
    resize() {
      const userAgent = navigator.userAgent
      if (userAgent.indexOf("Firefox") > -1 || (userAgent.indexOf("Safari") > -1 && userAgent.indexOf("Chrome") == -1)) {
        setTimeout(() => {
          this.$refs.prompt.style.height = 'auto'
          this.$refs.prompt.style.height = this.$refs.prompt.scrollHeight + 'px'
        })
      }
    },
    scroll(block='end') {
      setTimeout(() => document.querySelector("ul#chat > li:last-child")?.scrollIntoView({ behavior: 'smooth', block: block }))
    },
    clear() {
      if (confirm('Clear Conversation?')) {
        this.messages = []
        this.total_tokens = 0
        this.updateLocalStorage()
      }
    },
    updateLocalStorage() {
      localStorage.setItem('messages_' + this.settings.model, JSON.stringify(this.messages))
      localStorage.setItem('total_tokens_' + this.settings.model, this.total_tokens)
    },
    send() {
      if (this.loading || !this.settings.token) return
      this.messages.push({ role: 'user', content: this.input })
      this.loading = true
      this.input = ''
      this.resize()
      this.scroll()
      this.chat()
    },
    payload() {
      const messages = this.messages.filter(message => message.role != 'thoughts').slice(-7)
      const is_instruction_supported = !['o1-mini', 'DeepSeek-R1'].includes(this.settings.model)

      if (is_instruction_supported && messages.find(message => message.role == 'system') == undefined) {
        messages.unshift({ role: 'system', content: this.settings.system[this.settings.model] })
      }

      const data = {
        model: this.settings.model,
        max_completion_tokens: this.has_large_tokens ? 16384 : 4096,
        temperature: this.is_oX ? 1.0 : 0.7,
        messages: messages
      }

      if (this.is_streaming_unsupported) {
        return data
      } else {
        return { ...data, stream: true, stream_options: { include_usage: true } }
      }
    },
    async chat() {
      const body = JSON.stringify(this.payload())
      this.messages.push({ role: this.is_r1 ? 'thoughts' : 'assistant', content: 'Thinking...' })

      const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.token}`
        },
        body: body
      })

      this.is_streaming_unsupported ? await this.parse(response) : await this.stream(response)
      this.updateLocalStorage()
      this.loading = false
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

        const result = this.messages[this.messages.length - 1]

        if (this.is_r1) {
          const thinkTagsMatcher = result.content.match(/<think>\s*([\s\S]*?)\s*<\/think>/i)
          const thoughts = thinkTagsMatcher ? thinkTagsMatcher[1].trim() : ''
          const conclusion = result.content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

          result.content = marked.parse(thoughts)
          this.messages.push({ role: 'assistant', content: marked.parse(conclusion) })
        } else {
          result.content = marked.parse(result.content)
        }

        this.scroll('start')
      } else {
        response.json().then(data => this.error(data))
      }
    },
    async error(data) {
      let content = '[Error] ' + data.error.message

      if (data.error.code == 'unavailable_model') {
        const model = this.models.find(model => model.value == this.settings.model)
        content += `<br>You may need GitHub Copilot Pro subscription to use ${model.name}.`
      }

      this.messages[this.messages.length - 1].content = content
      this.scroll('start')
    }
  }
}).mount('body')
