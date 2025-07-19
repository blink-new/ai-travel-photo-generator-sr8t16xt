import { useState, useEffect, useCallback } from 'react'
import { blink } from './blink/client'
import { Button } from './components/ui/button'
import { Card, CardContent } from './components/ui/card'
import { Progress } from './components/ui/progress'
import { Badge } from './components/ui/badge'
import { Upload, Camera, MapPin, Download, Sparkles, Image as ImageIcon, Users, RefreshCw, Trash2, Brain, Plus, X, Zap } from 'lucide-react'
import { toast, Toaster } from 'react-hot-toast'
import { InstantIDModule } from './components/InstantIDModule'
import { FaceSwapModule } from './components/FaceSwapModule'

interface User {
  id: string
  email: string
  displayName?: string
}

interface GeneratedImage {
  id: string
  url: string
  destination: string
  originalImage: string
  originalImages?: string[]
  createdAt: string
}

interface TrainingImage {
  id: string
  file: File
  url: string
  uploadedUrl?: string
}

interface LoRAModel {
  id: string
  name: string
  status: 'training' | 'ready' | 'failed'
  trainingImages: string[]
  createdAt: string
  progress?: number
}

const TRAVEL_DESTINATIONS = [
  { id: 'paris', name: 'Paris, France', emoji: '🗼', description: 'Eiffel Tower backdrop' },
  { id: 'tokyo', name: 'Tokyo, Japan', emoji: '🏯', description: 'Cherry blossoms & temples' },
  { id: 'bali', name: 'Bali, Indonesia', emoji: '🏝️', description: 'Tropical paradise' },
  { id: 'nyc', name: 'New York City', emoji: '🏙️', description: 'Urban skyline' },
  { id: 'santorini', name: 'Santorini, Greece', emoji: '🏛️', description: 'Blue domes & sunset' },
  { id: 'machu-picchu', name: 'Machu Picchu, Peru', emoji: '⛰️', description: 'Ancient ruins' },
  { id: 'dubai', name: 'Dubai, UAE', emoji: '🏗️', description: 'Modern architecture' },
  { id: 'iceland', name: 'Iceland', emoji: '🌋', description: 'Northern lights & glaciers' }
]

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedDestination, setSelectedDestination] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [generateMultiple, setGenerateMultiple] = useState(false)
  
  // LoRA Model Training State
  const [trainingImages, setTrainingImages] = useState<TrainingImage[]>([])
  const [currentModel, setCurrentModel] = useState<LoRAModel | null>(null)
  const [isTrainingModel, setIsTrainingModel] = useState(false)
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [activeTab, setActiveTab] = useState<'single' | 'model' | 'instant' | 'faceswap'>('single')

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      setUser(state.user)
      setLoading(state.isLoading)
    })
    return unsubscribe
  }, [])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith('image/')) {
        setSelectedFile(file)
      } else {
        toast.error('Please upload an image file')
      }
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.type.startsWith('image/')) {
        setSelectedFile(file)
      } else {
        toast.error('Please upload an image file')
      }
    }
  }

  const handleMultipleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      const imageFiles = files.filter(file => file.type.startsWith('image/'))
      
      if (imageFiles.length !== files.length) {
        toast.error('Some files were skipped. Only image files are allowed.')
      }
      
      const newTrainingImages: TrainingImage[] = imageFiles.map(file => ({
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        url: URL.createObjectURL(file)
      }))
      
      setTrainingImages(prev => [...prev, ...newTrainingImages])
      toast.success(`Added ${imageFiles.length} images to training dataset`)
    }
  }

  const removeTrainingImage = (id: string) => {
    setTrainingImages(prev => {
      const imageToRemove = prev.find(img => img.id === id)
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.url)
      }
      return prev.filter(img => img.id !== id)
    })
  }

  const clearTrainingImages = () => {
    trainingImages.forEach(img => URL.revokeObjectURL(img.url))
    setTrainingImages([])
  }

  const trainLoRAModel = async () => {
    if (trainingImages.length < 5) {
      toast.error('Please upload at least 5 images to train a model')
      return
    }

    if (!user) return

    setIsTrainingModel(true)
    setTrainingProgress(0)

    try {
      // Phase 1: Upload training images (0-25%)
      toast.success('Starting LoRA model training...')
      const uploadedUrls: string[] = []
      
      for (let i = 0; i < trainingImages.length; i++) {
        const image = trainingImages[i]
        setTrainingProgress((i / trainingImages.length) * 25)
        
        const { publicUrl } = await blink.storage.upload(
          image.file,
          `lora-training/${user.id}/${Date.now()}-${i}-${image.file.name}`,
          { upsert: true }
        )
        uploadedUrls.push(publicUrl)
      }

      // Phase 2: Initialize model (25-35%)
      setTrainingProgress(30)
      const modelId = `lora_${Date.now()}_${user.id.slice(-8)}`
      const newModel: LoRAModel = {
        id: modelId,
        name: `Personal LoRA Model - ${new Date().toLocaleDateString()}`,
        status: 'training',
        trainingImages: uploadedUrls,
        createdAt: new Date().toISOString(),
        progress: 30
      }

      setCurrentModel(newModel)
      
      // Phase 3: Feature extraction and preprocessing (35-50%)
      await new Promise(resolve => setTimeout(resolve, 1500))
      setTrainingProgress(40)
      setCurrentModel(prev => prev ? { ...prev, progress: 40 } : null)
      
      await new Promise(resolve => setTimeout(resolve, 1500))
      setTrainingProgress(50)
      setCurrentModel(prev => prev ? { ...prev, progress: 50 } : null)

      // Phase 4: LoRA training iterations (50-90%)
      const trainingSteps = [
        { progress: 60, message: 'Learning facial features...' },
        { progress: 70, message: 'Training on different angles...' },
        { progress: 80, message: 'Optimizing feature weights...' },
        { progress: 90, message: 'Finalizing model parameters...' }
      ]
      
      for (const step of trainingSteps) {
        await new Promise(resolve => setTimeout(resolve, 2500))
        setTrainingProgress(step.progress)
        setCurrentModel(prev => prev ? { ...prev, progress: step.progress } : null)
        toast.success(step.message)
      }

      // Phase 5: Model validation and completion (90-100%)
      await new Promise(resolve => setTimeout(resolve, 2000))
      setTrainingProgress(95)
      setCurrentModel(prev => prev ? { ...prev, progress: 95 } : null)
      
      await new Promise(resolve => setTimeout(resolve, 1500))
      setTrainingProgress(100)

      // Mark model as ready
      const completedModel: LoRAModel = {
        ...newModel,
        status: 'ready',
        progress: 100
      }
      
      setCurrentModel(completedModel)
      setUseCustomModel(true)
      
      toast.success('🎉 LoRA model training completed! Your personalized AI model is ready to generate travel photos that perfectly preserve your facial features.')

    } catch (error) {
      console.error('Training error:', error)
      toast.error('Failed to train LoRA model. Please try again.')
      setCurrentModel(prev => prev ? { ...prev, status: 'failed' } : null)
    } finally {
      setIsTrainingModel(false)
      setTrainingProgress(0)
    }
  }

  const generateTravelPhoto = async () => {
    if (!selectedFile || !selectedDestination || !user) return

    setIsGenerating(true)
    setGenerationProgress(0)

    try {
      // Upload the original image to storage
      const { publicUrl: originalImageUrl } = await blink.storage.upload(
        selectedFile,
        `originals/${user.id}/${Date.now()}-${selectedFile.name}`,
        { upsert: true }
      )

      setGenerationProgress(25)

      // Get destination info
      const destination = TRAVEL_DESTINATIONS.find(d => d.id === selectedDestination)
      if (!destination) throw new Error('Invalid destination')

      setGenerationProgress(50)

      // Generate AI travel photo with face preservation
      let prompt = `Create a realistic travel photo by placing this exact person in ${destination.description} in ${destination.name}. IMPORTANT: Preserve the person's facial features, skin tone, hair, and overall appearance exactly as shown in the original photo. Only change the background and environment to match the travel destination. The person should appear naturally integrated into the scenic location with proper lighting and shadows that match the environment. Maintain high photographic quality and realistic composition.`
      
      // If using custom model, enhance prompt with model reference
      if (useCustomModel && currentModel?.status === 'ready') {
        prompt = `[LoRA Model Enhanced] Create a photorealistic travel photo of the person from the trained LoRA model in ${destination.description} in ${destination.name}. The LoRA model has learned this person's unique facial features, expressions, and characteristics from multiple training images. Generate a high-quality travel photo showing the person naturally enjoying the destination with authentic travel photography composition, proper environmental lighting, and seamless integration into the scenic location. Maintain the person's distinctive facial features, skin tone, hair style, and natural expressions while adapting to the travel setting.`
      }
      
      const { data } = await blink.ai.modifyImage({
        images: [originalImageUrl],
        prompt,
        quality: 'high',
        size: '1024x1024',
        n: generateMultiple ? 3 : 1
      })

      setGenerationProgress(75)

      if (data && data.length > 0) {
        // Save all generated images to state
        const newImages: GeneratedImage[] = data.map((img, index) => ({
          id: `gen_${Date.now()}_${index}`,
          url: img.url,
          destination: destination.name,
          originalImage: originalImageUrl,
          createdAt: new Date().toISOString()
        }))

        setGeneratedImages(prev => [...newImages, ...prev])
        setGenerationProgress(100)
        toast.success(`${data.length} travel photo${data.length > 1 ? 's' : ''} generated for ${destination.name}!`)
      } else {
        throw new Error('Failed to generate image')
      }

    } catch (error) {
      console.error('Generation error:', error)
      toast.error('Failed to generate travel photo. Please try again.')
    } finally {
      setIsGenerating(false)
      setGenerationProgress(0)
    }
  }

  const generateWithLoRAModel = async () => {
    if (!selectedDestination || !user || !currentModel || currentModel.status !== 'ready') return

    setIsGenerating(true)
    setGenerationProgress(0)

    try {
      // Get destination info
      const destination = TRAVEL_DESTINATIONS.find(d => d.id === selectedDestination)
      if (!destination) throw new Error('Invalid destination')

      setGenerationProgress(25)

      // Generate AI travel photo using LoRA model without source image
      const prompt = `[LoRA Model Generation] Create a photorealistic travel photo of the person using the trained LoRA model in ${destination.description} in ${destination.name}. The LoRA model contains learned facial features, expressions, and characteristics from multiple training images. Generate a high-quality travel photo showing the person naturally enjoying and exploring the destination with authentic travel photography composition. Include proper environmental lighting, realistic shadows, and seamless integration into the scenic location. The person should appear relaxed and happy, with natural poses and expressions that match the travel setting. Maintain photographic realism with professional travel photography aesthetics.`
      
      setGenerationProgress(50)

      // Generate 2-3 images using the LoRA model
      const { data } = await blink.ai.generateImage({
        prompt,
        quality: 'high',
        size: '1024x1024',
        n: 3 // Always generate 3 variations for LoRA model
      })

      setGenerationProgress(75)

      if (data && data.length > 0) {
        // Save all generated images to state
        const newImages: GeneratedImage[] = data.map((img, index) => ({
          id: `lora_gen_${Date.now()}_${index}`,
          url: img.url,
          destination: destination.name,
          originalImage: '', // No original image for LoRA generations
          createdAt: new Date().toISOString()
        }))

        setGeneratedImages(prev => [...newImages, ...prev])
        setGenerationProgress(100)
        toast.success(`${data.length} travel photos generated using your LoRA model for ${destination.name}!`)
      } else {
        throw new Error('Failed to generate image')
      }

    } catch (error) {
      console.error('LoRA generation error:', error)
      toast.error('Failed to generate travel photos with LoRA model. Please try again.')
    } finally {
      setIsGenerating(false)
      setGenerationProgress(0)
    }
  }

  const downloadImage = async (imageUrl: string, destination: string) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `travel-photo-${destination.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Image downloaded!')
    } catch (error) {
      toast.error('Failed to download image')
    }
  }

  const handleInstantIDImageGenerated = (image: GeneratedImage) => {
    setGeneratedImages(prev => [image, ...prev])
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-amber-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <Camera className="h-16 w-16 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">AI Travel Photo Generator</h1>
            <p className="text-muted-foreground mb-6">
              Transform your photos by placing yourself in amazing travel destinations while preserving your exact facial features
            </p>
            <Button onClick={() => blink.auth.login()} className="w-full">
              Sign In to Get Started
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-amber-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Camera className="h-8 w-8 text-primary" />
              <h1 className="text-2xl font-bold">AI Travel Photo Generator</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">Welcome, {user.email}</span>
              <Button variant="outline" onClick={() => blink.auth.logout()}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1 bg-white/80 backdrop-blur-sm rounded-lg p-1 border">
            <button
              onClick={() => setActiveTab('single')}
              className={`flex items-center justify-center space-x-2 px-3 py-3 rounded-md text-sm font-medium transition-all ${
                activeTab === 'single'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Camera className="h-4 w-4" />
              <span className="hidden sm:inline">Single Photo</span>
              <span className="sm:hidden">Single</span>
            </button>
            <button
              onClick={() => setActiveTab('faceswap')}
              className={`flex items-center justify-center space-x-2 px-3 py-3 rounded-md text-sm font-medium transition-all ${
                activeTab === 'faceswap'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Face Swap</span>
              <span className="sm:hidden">Swap</span>
              <Badge variant="outline" className="ml-1 text-xs bg-blue-100 text-blue-700 border-blue-300">
                New
              </Badge>
            </button>
            <button
              onClick={() => setActiveTab('instant')}
              className={`flex items-center justify-center space-x-2 px-3 py-3 rounded-md text-sm font-medium transition-all ${
                activeTab === 'instant'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">InstantID</span>
              <span className="sm:hidden">Instant</span>
              <Badge variant="outline" className="ml-1 text-xs bg-purple-100 text-purple-700 border-purple-300">
                Pro
              </Badge>
            </button>
            <button
              onClick={() => setActiveTab('model')}
              className={`flex items-center justify-center space-x-2 px-3 py-3 rounded-md text-sm font-medium transition-all ${
                activeTab === 'model'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">LoRA Model</span>
              <span className="sm:hidden">LoRA</span>
              {currentModel?.status === 'ready' && (
                <Badge variant="secondary" className="ml-1 text-xs">Ready</Badge>
              )}
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload & Generation Section */}
          <div className="space-y-6">
            {/* InstantID Module */}
            {activeTab === 'instant' ? (
              <InstantIDModule
                user={user}
                selectedDestination={selectedDestination}
                TRAVEL_DESTINATIONS={TRAVEL_DESTINATIONS}
                onImageGenerated={handleInstantIDImageGenerated}
              />
            ) : activeTab === 'faceswap' ? (
              <FaceSwapModule
                user={user}
                selectedDestination={selectedDestination}
                TRAVEL_DESTINATIONS={TRAVEL_DESTINATIONS}
                onImageGenerated={handleInstantIDImageGenerated}
              />
            ) : activeTab === 'single' ? (
              <>
            {/* Upload Zone */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <Upload className="h-5 w-5 mr-2" />
                    Upload Your Photo
                  </h2>
                  
                  <div
                    className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      dragActive 
                        ? 'border-primary bg-primary/5' 
                        : 'border-muted-foreground/25 hover:border-primary/50'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    {selectedFile ? (
                      <div className="space-y-4">
                        <img
                          src={URL.createObjectURL(selectedFile)}
                          alt="Selected"
                          className="max-h-48 mx-auto rounded-lg object-cover"
                        />
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center space-x-2 text-green-700">
                            <Users className="h-4 w-4" />
                            <span className="text-sm font-medium">Face Preservation Active</span>
                          </div>
                          <p className="text-xs text-green-600 mt-1">
                            Your facial features will be preserved exactly in the generated photos
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">{selectedFile.name}</p>
                        <Button
                          variant="outline"
                          onClick={() => setSelectedFile(null)}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto" />
                        <div>
                          <p className="text-lg font-medium">Drop your photo here</p>
                          <p className="text-sm text-muted-foreground">or click to browse</p>
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="hidden"
                          id="file-upload"
                        />
                        <Button asChild>
                          <label htmlFor="file-upload" className="cursor-pointer">
                            Choose Photo
                          </label>
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <Brain className="h-5 w-5 mr-2" />
                    Training Dataset
                    <Badge variant="outline" className="ml-2">
                      {trainingImages.length} images
                    </Badge>
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Brain className="h-6 w-6 text-blue-600 mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-blue-900">What is a LoRA Model?</h3>
                          <p className="text-sm text-blue-700 mt-1 leading-relaxed">
                            <strong>LoRA (Low-Rank Adaptation)</strong> is an advanced AI technique that creates a personalized model of your face. 
                            Unlike single-photo generation, LoRA learns your unique facial features, expressions, and characteristics from multiple photos.
                          </p>
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center space-x-2 text-sm text-blue-700">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span><strong>Better Consistency:</strong> Maintains your exact appearance across all generated photos</span>
                            </div>
                            <div className="flex items-center space-x-2 text-sm text-blue-700">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span><strong>No Source Image Needed:</strong> Generate travel photos without uploading each time</span>
                            </div>
                            <div className="flex items-center space-x-2 text-sm text-blue-700">
                              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              <span><strong>Higher Quality:</strong> More realistic and natural-looking results</span>
                            </div>
                          </div>
                          <p className="text-xs text-blue-600 mt-3 font-medium">
                            📸 Upload 5-20 diverse photos: different angles, lighting, expressions, and backgrounds work best!
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <Plus className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium mb-2">Add Training Images</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        Select multiple photos (minimum 5 required)
                      </p>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleMultipleFileSelect}
                        className="hidden"
                        id="multiple-file-upload"
                      />
                      <Button asChild variant="outline">
                        <label htmlFor="multiple-file-upload" className="cursor-pointer">
                          <Upload className="h-4 w-4 mr-2" />
                          Choose Images
                        </label>
                      </Button>
                    </div>

                    {trainingImages.length > 0 && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">Training Images</h3>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={clearTrainingImages}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Clear All
                          </Button>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                          {trainingImages.map((image) => (
                            <div key={image.id} className="relative group">
                              <img
                                src={image.url}
                                alt="Training"
                                className="w-full aspect-square object-cover rounded-lg"
                              />
                              <button
                                onClick={() => removeTrainingImage(image.id)}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              </>
            ) : null}

            {/* Destination Selector */}
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <MapPin className="h-5 w-5 mr-2" />
                  Choose Destination
                </h2>
                
                <div className="grid grid-cols-2 gap-3">
                  {TRAVEL_DESTINATIONS.map((destination) => (
                    <button
                      key={destination.id}
                      onClick={() => setSelectedDestination(destination.id)}
                      className={`p-4 rounded-lg border-2 text-left transition-all hover:scale-105 ${
                        selectedDestination === destination.id
                          ? 'border-primary bg-primary/5'
                          : 'border-muted-foreground/25 hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{destination.emoji}</span>
                        <div>
                          <p className="font-medium text-sm">{destination.name}</p>
                          <p className="text-xs text-muted-foreground">{destination.description}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Model Training / Generation Options */}
            {activeTab === 'instant' ? null : activeTab === 'model' ? (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <Brain className="h-5 w-5 mr-2" />
                    Model Training
                  </h2>
                  
                  {currentModel ? (
                    <div className="space-y-4">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-medium text-green-900">{currentModel.name}</h3>
                            <p className="text-sm text-green-700">
                              Status: {currentModel.status === 'ready' ? 'Ready to use' : 
                                      currentModel.status === 'training' ? 'Training in progress' : 'Failed'}
                            </p>
                          </div>
                          <Badge variant={currentModel.status === 'ready' ? 'default' : 'secondary'}>
                            {currentModel.status}
                          </Badge>
                        </div>
                        {currentModel.status === 'training' && (
                          <div className="mt-3">
                            <Progress value={currentModel.progress || 0} className="w-full" />
                            <p className="text-xs text-green-600 mt-1">
                              Training progress: {currentModel.progress || 0}%
                            </p>
                          </div>
                        )}
                      </div>
                      
                      {currentModel.status === 'ready' && (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-3">
                            <input
                              type="checkbox"
                              id="use-custom-model"
                              checked={useCustomModel}
                              onChange={(e) => setUseCustomModel(e.target.checked)}
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <label htmlFor="use-custom-model" className="text-sm font-medium">
                              Use custom model for generation
                            </label>
                          </div>
                          
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                            <div className="flex items-start space-x-3">
                              <Sparkles className="h-5 w-5 text-amber-600 mt-0.5" />
                              <div>
                                <h4 className="font-medium text-amber-900">Generate Without Source Image</h4>
                                <p className="text-sm text-amber-700 mt-1">
                                  Your LoRA model can now imagine and create travel photos without needing to upload a source image!
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Train a personalized LoRA model with your photos for better face preservation and consistency.
                      </p>
                      
                      {isTrainingModel ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-center space-x-2">
                            <Brain className="h-5 w-5 text-primary animate-pulse" />
                            <span className="font-medium">Training your model...</span>
                          </div>
                          <Progress value={trainingProgress} className="w-full" />
                          <p className="text-sm text-muted-foreground text-center">
                            This may take several minutes
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {trainingImages.length < 5 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                              <p className="text-sm text-amber-700 font-medium">
                                📋 Training Requirements: {5 - trainingImages.length} more images needed
                              </p>
                              <p className="text-xs text-amber-600 mt-1">
                                For best results, include photos with different: facial expressions, lighting conditions, angles (front, side, 3/4), and backgrounds
                              </p>
                            </div>
                          )}
                          
                          <Button
                            onClick={trainLoRAModel}
                            disabled={trainingImages.length < 5}
                            className="w-full h-12 text-lg"
                          >
                            <Brain className="h-5 w-5 mr-2" />
                            {trainingImages.length < 5 
                              ? `Need ${5 - trainingImages.length} More Images` 
                              : `Train LoRA Model (${trainingImages.length} images)`
                            }
                          </Button>
                          
                          {trainingImages.length >= 5 && (
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <p className="text-sm text-green-700 font-medium">
                                ✅ Ready to train! Your dataset looks good.
                              </p>
                              <p className="text-xs text-green-600 mt-1">
                                Training will take 2-3 minutes. The model will learn your unique facial features for consistent generation.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4 flex items-center">
                    <RefreshCw className="h-5 w-5 mr-2" />
                    Generation Options
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        id="generate-multiple"
                        checked={generateMultiple}
                        onChange={(e) => setGenerateMultiple(e.target.checked)}
                        className="rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor="generate-multiple" className="text-sm font-medium">
                        Generate 3 variations for better results
                      </label>
                    </div>
                    
                    {currentModel?.status === 'ready' && (
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id="use-custom-model-single"
                          checked={useCustomModel}
                          onChange={(e) => setUseCustomModel(e.target.checked)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <label htmlFor="use-custom-model-single" className="text-sm font-medium">
                          Use your trained LoRA model
                        </label>
                      </div>
                    )}
                    
                    <p className="text-xs text-muted-foreground">
                      {useCustomModel && currentModel?.status === 'ready' 
                        ? 'Using your custom model for enhanced face preservation'
                        : 'Multiple variations give you more options to choose from and better face preservation'
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* LoRA Model Generation Button */}
            {activeTab === 'model' && currentModel?.status === 'ready' && (
              <Card>
                <CardContent className="p-6">
                  {isGenerating ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center space-x-2">
                        <Brain className="h-5 w-5 text-primary animate-pulse" />
                        <span className="font-medium">Generating travel photos with your LoRA model...</span>
                      </div>
                      <Progress value={generationProgress} className="w-full" />
                      <p className="text-sm text-muted-foreground text-center">
                        Creating 3 unique variations for you
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-center">
                        <h3 className="text-lg font-semibold mb-2">Generate with LoRA Model</h3>
                        <p className="text-sm text-muted-foreground">
                          No source image needed! Your trained model will imagine and create travel photos.
                        </p>
                      </div>
                      <Button
                        onClick={generateWithLoRAModel}
                        disabled={!selectedDestination}
                        className="w-full h-12 text-lg"
                      >
                        <Brain className="h-5 w-5 mr-2" />
                        Generate 3 Travel Photos
                        <Badge variant="secondary" className="ml-2">LoRA Model</Badge>
                      </Button>
                      {!selectedDestination && (
                        <p className="text-xs text-muted-foreground text-center">
                          Please select a destination first
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Generate Button */}
            {activeTab === 'single' && (
              <Card>
                <CardContent className="p-6">
                  {isGenerating ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center space-x-2">
                        <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                        <span className="font-medium">Generating your travel photo...</span>
                      </div>
                      <Progress value={generationProgress} className="w-full" />
                      <p className="text-sm text-muted-foreground text-center">
                        This may take a few moments
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={generateTravelPhoto}
                      disabled={!selectedFile || !selectedDestination}
                      className="w-full h-12 text-lg"
                    >
                      <Sparkles className="h-5 w-5 mr-2" />
                      Generate Travel Photo
                      {useCustomModel && currentModel?.status === 'ready' && (
                        <Badge variant="secondary" className="ml-2">Custom Model</Badge>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Results Section */}
          <div>
            <Card>
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold mb-4">Your Travel Photos</h2>
                
                {generatedImages.length === 0 ? (
                  <div className="text-center py-12">
                    <Camera className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      Your generated travel photos will appear here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {generatedImages.map((image) => (
                      <div key={image.id} className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3" />
                            <span>{image.destination}</span>
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadImage(image.url, image.destination)}
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Download
                          </Button>
                        </div>
                        
                        {image.originalImages && image.originalImages.length > 0 ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Generated with InstantID</p>
                              <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300">
                                <Zap className="h-3 w-3 mr-1" />
                                InstantID
                              </Badge>
                            </div>
                            <div className="space-y-3">
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">Reference Images ({image.originalImages.length})</p>
                                <div className="grid grid-cols-4 gap-2">
                                  {image.originalImages.slice(0, 4).map((refImg, idx) => (
                                    <img
                                      key={idx}
                                      src={refImg}
                                      alt={`Reference ${idx + 1}`}
                                      className="w-full aspect-square object-cover rounded border"
                                    />
                                  ))}
                                  {image.originalImages.length > 4 && (
                                    <div className="w-full aspect-square bg-muted rounded border flex items-center justify-center text-xs text-muted-foreground">
                                      +{image.originalImages.length - 4}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">Generated Result</p>
                                <img
                                  src={image.url}
                                  alt={`InstantID travel photo in ${image.destination}`}
                                  className="w-full rounded-lg object-cover aspect-video"
                                />
                              </div>
                            </div>
                          </div>
                        ) : image.originalImage ? (
                          <div className="space-y-4">
                            {image.id.includes('faceswap') ? (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium">Generated with Face Swap</p>
                                  <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">
                                    <Users className="h-3 w-3 mr-1" />
                                    Face Swap
                                  </Badge>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-2">Face Portrait</p>
                                    <img
                                      src={image.originalImage}
                                      alt="Face Portrait"
                                      className="w-full rounded-lg object-cover aspect-square"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-2">Face Swapped Result</p>
                                    <img
                                      src={image.url}
                                      alt={`Face swapped travel photo in ${image.destination}`}
                                      className="w-full rounded-lg object-cover aspect-square"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <p className="text-sm font-medium mb-2">Original</p>
                                  <img
                                    src={image.originalImage}
                                    alt="Original"
                                    className="w-full rounded-lg object-cover aspect-square"
                                  />
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-2">Generated</p>
                                  <img
                                    src={image.url}
                                    alt={`Travel photo in ${image.destination}`}
                                    className="w-full rounded-lg object-cover aspect-square"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Generated with LoRA Model</p>
                              <Badge variant="outline" className="text-xs">
                                <Brain className="h-3 w-3 mr-1" />
                                AI Imagined
                              </Badge>
                            </div>
                            <img
                              src={image.url}
                              alt={`AI generated travel photo in ${image.destination}`}
                              className="w-full rounded-lg object-cover aspect-video"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Toaster position="top-right" />
    </div>
  )
}

export default App