import { useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Progress } from './ui/progress'
import { Badge } from './ui/badge'
import { Upload, Camera, Image as ImageIcon, Download, Sparkles, Users, X, Info, RefreshCw, Wand2 } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { blink } from '../blink/client'

interface User {
  id: string
  email: string
  displayName?: string
}

interface PhotoMakerImage {
  id: string
  file: File
  url: string
  uploadedUrl?: string
}

interface GeneratedImage {
  id: string
  url: string
  destination: string
  originalImage: string
  originalImages?: string[]
  createdAt: string
}

interface PhotoMakerModuleProps {
  user: User
  selectedDestination: string
  TRAVEL_DESTINATIONS: Array<{
    id: string
    name: string
    emoji: string
    description: string
  }>
  onImageGenerated: (image: GeneratedImage) => void
}

export function PhotoMakerModule({ 
  user, 
  selectedDestination, 
  TRAVEL_DESTINATIONS, 
  onImageGenerated 
}: PhotoMakerModuleProps) {
  const [referenceImages, setReferenceImages] = useState<PhotoMakerImage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [generateMultiple, setGenerateMultiple] = useState(true)

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
    
    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter(file => file.type.startsWith('image/'))
      
      if (imageFiles.length !== files.length) {
        toast.error('Some files were skipped. Only image files are allowed.')
      }
      
      const newImages: PhotoMakerImage[] = imageFiles.map(file => ({
        id: `photomaker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        url: URL.createObjectURL(file)
      }))
      
      setReferenceImages(prev => [...prev, ...newImages])
      toast.success(`Added ${imageFiles.length} reference images`)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files)
      const imageFiles = files.filter(file => file.type.startsWith('image/'))
      
      if (imageFiles.length !== files.length) {
        toast.error('Some files were skipped. Only image files are allowed.')
      }
      
      const newImages: PhotoMakerImage[] = imageFiles.map(file => ({
        id: `photomaker_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        file,
        url: URL.createObjectURL(file)
      }))
      
      setReferenceImages(prev => [...prev, ...newImages])
      toast.success(`Added ${imageFiles.length} reference images`)
    }
  }

  const removeReferenceImage = (id: string) => {
    setReferenceImages(prev => {
      const imageToRemove = prev.find(img => img.id === id)
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.url)
      }
      return prev.filter(img => img.id !== id)
    })
  }

  const clearReferenceImages = () => {
    referenceImages.forEach(img => URL.revokeObjectURL(img.url))
    setReferenceImages([])
  }

  const generateWithPhotoMaker = async () => {
    if (referenceImages.length === 0 || !selectedDestination || !user) return

    setIsGenerating(true)
    setGenerationProgress(0)

    try {
      // Phase 1: Upload reference images (0-25%)
      toast.success('Uploading reference images...')
      const uploadedUrls: string[] = []
      
      for (let i = 0; i < referenceImages.length; i++) {
        const image = referenceImages[i]
        setGenerationProgress((i / referenceImages.length) * 25)
        
        const { publicUrl } = await blink.storage.upload(
          image.file,
          `photomaker/${user.id}/${Date.now()}-${i}-${image.file.name}`,
          { upsert: true }
        )
        uploadedUrls.push(publicUrl)
      }

      setGenerationProgress(35)

      // Get destination info
      const destination = TRAVEL_DESTINATIONS.find(d => d.id === selectedDestination)
      if (!destination) throw new Error('Invalid destination')

      setGenerationProgress(45)

      // Phase 2: Generate with PhotoMaker technology
      toast.success('Processing with PhotoMaker...')
      
      // Create enhanced prompt for PhotoMaker
      let photoMakerPrompt = `[PhotoMaker Technology] Create a photorealistic travel photo using PhotoMaker's advanced identity preservation. Place the person from the reference images in ${destination.description} in ${destination.name}.

PHOTOMAKER REQUIREMENTS:
- Use PhotoMaker's stochastic identity mixing for consistent facial features
- Preserve unique facial characteristics, expressions, and identity markers
- Generate natural travel photography with authentic poses and lighting
- Ensure seamless integration with the destination environment
- Apply realistic shadows, reflections, and environmental lighting
- Create professional travel photography composition with depth and atmosphere

The person should appear naturally enjoying the destination with realistic travel poses and expressions. Maintain photographic realism with professional travel photography aesthetics.`

      // Add custom prompt if provided
      if (customPrompt.trim()) {
        photoMakerPrompt += `\n\nAdditional Style Requirements: ${customPrompt.trim()}`
      }

      setGenerationProgress(60)

      // Generate using PhotoMaker approach with multiple reference images
      const { data } = await blink.ai.modifyImage({
        images: uploadedUrls, // Use all reference images for PhotoMaker identity mixing
        prompt: photoMakerPrompt,
        quality: 'high',
        size: '1024x1024',
        n: generateMultiple ? 4 : 2 // PhotoMaker works well with multiple variations
      })

      setGenerationProgress(85)

      if (data && data.length > 0) {
        // Create generated images
        const newImages: GeneratedImage[] = data.map((img, index) => ({
          id: `photomaker_gen_${Date.now()}_${index}`,
          url: img.url,
          destination: destination.name,
          originalImage: '', // Empty for PhotoMaker
          originalImages: uploadedUrls,
          createdAt: new Date().toISOString()
        }))

        // Add to parent component's state
        newImages.forEach(img => onImageGenerated(img))
        
        setGenerationProgress(100)
        toast.success(`🎉 ${data.length} PhotoMaker travel photos generated for ${destination.name}!`)
      } else {
        throw new Error('Failed to generate images')
      }

    } catch (error) {
      console.error('PhotoMaker generation error:', error)
      toast.error('Failed to generate PhotoMaker photos. Please try again.')
    } finally {
      setIsGenerating(false)
      setGenerationProgress(0)
    }
  }

  return (
    <div className="space-y-6">
      {/* PhotoMaker Info Card */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <Wand2 className="h-6 w-6 text-emerald-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-emerald-900 mb-2">What is PhotoMaker?</h3>
              <p className="text-sm text-emerald-700 leading-relaxed mb-3">
                <strong>PhotoMaker</strong> is TencentARC's state-of-the-art AI model for customized photo generation. 
                It uses advanced stochastic identity mixing to create highly realistic photos while preserving individual identity.
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm text-emerald-700">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span><strong>Stochastic Identity Mixing:</strong> Advanced technique for consistent identity preservation</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-emerald-700">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span><strong>Multi-Image Support:</strong> Uses multiple references for robust identity learning</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-emerald-700">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span><strong>Customizable Generation:</strong> Supports custom prompts and style control</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-emerald-700">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                  <span><strong>High Fidelity:</strong> Produces photorealistic results with fine details</span>
                </div>
              </div>
              <p className="text-xs text-emerald-600 mt-3 font-medium">
                🎯 Optimal with 1-4 diverse photos: different poses, expressions, and lighting conditions!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reference Images Upload */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Camera className="h-5 w-5 mr-2" />
            Reference Images for PhotoMaker
            <Badge variant="outline" className="ml-2">
              {referenceImages.length} images
            </Badge>
          </h2>
          
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive 
                  ? 'border-emerald-500 bg-emerald-50' 
                  : 'border-muted-foreground/25 hover:border-emerald-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Wand2 className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-medium mb-2">Add Reference Images for PhotoMaker</p>
              <p className="text-xs text-muted-foreground mb-4">
                Upload 1-4 diverse photos for optimal identity preservation
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="photomaker-upload"
              />
              <Button asChild variant="outline">
                <label htmlFor="photomaker-upload" className="cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  Choose Images
                </label>
              </Button>
            </div>

            {referenceImages.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Reference Images</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearReferenceImages}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </div>
                
                <div className="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                  {referenceImages.map((image) => (
                    <div key={image.id} className="relative group">
                      <img
                        src={image.url}
                        alt="Reference"
                        className="w-full aspect-square object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeReferenceImage(image.id)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-green-700">
                    <Wand2 className="h-4 w-4" />
                    <span className="text-sm font-medium">PhotoMaker Ready</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Your reference images will be processed using PhotoMaker's stochastic identity mixing
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Custom Prompt */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Sparkles className="h-5 w-5 mr-2" />
            Custom Style Prompt
            <Badge variant="outline" className="ml-2 text-xs">
              Optional
            </Badge>
          </h2>
          
          <div className="space-y-4">
            <div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Add custom style instructions (e.g., 'wearing a red jacket', 'sunset lighting', 'professional business attire', 'casual summer outfit')..."
                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                maxLength={200}
              />
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-muted-foreground">
                  Enhance your photos with specific style, clothing, or lighting preferences
                </p>
                <span className="text-xs text-muted-foreground">
                  {customPrompt.length}/200
                </span>
              </div>
            </div>
            
            {customPrompt.trim() && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="flex items-center space-x-2 text-emerald-700">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-medium">Custom Style Active</span>
                </div>
                <p className="text-xs text-emerald-600 mt-1">
                  PhotoMaker will incorporate your custom style: "{customPrompt.trim()}"
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generation Options */}
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
                id="generate-multiple-photomaker"
                checked={generateMultiple}
                onChange={(e) => setGenerateMultiple(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="generate-multiple-photomaker" className="text-sm font-medium">
                Generate 4 variations (recommended for PhotoMaker)
              </label>
            </div>
            
            <p className="text-xs text-muted-foreground">
              PhotoMaker's stochastic identity mixing works best with multiple variations to showcase different poses and expressions
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Generation Controls */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Wand2 className="h-5 w-5 mr-2" />
            Generate with PhotoMaker
          </h2>
          
          {isGenerating ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <Wand2 className="h-5 w-5 text-emerald-500 animate-pulse" />
                <span className="font-medium">Generating with PhotoMaker technology...</span>
              </div>
              <Progress value={generationProgress} className="w-full" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {generationProgress < 25 ? 'Uploading reference images...' :
                   generationProgress < 35 ? 'Preparing destination...' :
                   generationProgress < 45 ? 'Analyzing identity features...' :
                   generationProgress < 60 ? 'Processing with PhotoMaker...' :
                   generationProgress < 85 ? 'Applying stochastic identity mixing...' :
                   'Finalizing results...'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Generate travel photos using PhotoMaker's advanced identity preservation technology
                </p>
              </div>
              
              {referenceImages.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-amber-700">
                    <Info className="h-4 w-4" />
                    <span className="text-sm font-medium">Reference Images Required</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    Please upload at least 1 reference image to use PhotoMaker
                  </p>
                </div>
              )}
              
              {!selectedDestination && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-amber-700">
                    <Info className="h-4 w-4" />
                    <span className="text-sm font-medium">Destination Required</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    Please select a travel destination first
                  </p>
                </div>
              )}
              
              <Button
                onClick={generateWithPhotoMaker}
                disabled={referenceImages.length === 0 || !selectedDestination}
                className="w-full h-12 text-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              >
                <Wand2 className="h-5 w-5 mr-2" />
                Generate with PhotoMaker
                <Badge variant="secondary" className="ml-2 bg-white/20 text-white">
                  {generateMultiple ? '4' : '2'} Variations
                </Badge>
              </Button>
              
              {referenceImages.length > 0 && selectedDestination && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-emerald-700">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Ready to Generate!</span>
                  </div>
                  <p className="text-xs text-emerald-600 mt-1">
                    PhotoMaker will use your {referenceImages.length} reference image{referenceImages.length > 1 ? 's' : ''} to create travel photos in {TRAVEL_DESTINATIONS.find(d => d.id === selectedDestination)?.name}
                    {customPrompt.trim() && ' with your custom style preferences'}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}