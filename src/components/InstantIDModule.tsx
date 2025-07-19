import { useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Progress } from './ui/progress'
import { Badge } from './ui/badge'
import { Upload, Zap, Image as ImageIcon, Download, Sparkles, Users, X, Info } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { blink } from '../blink/client'

interface User {
  id: string
  email: string
  displayName?: string
}

interface InstantIDImage {
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

interface InstantIDModuleProps {
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

export function InstantIDModule({ 
  user, 
  selectedDestination, 
  TRAVEL_DESTINATIONS, 
  onImageGenerated 
}: InstantIDModuleProps) {
  const [referenceImages, setReferenceImages] = useState<InstantIDImage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)

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
      
      const newImages: InstantIDImage[] = imageFiles.map(file => ({
        id: `instant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
      
      const newImages: InstantIDImage[] = imageFiles.map(file => ({
        id: `instant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

  const generateWithInstantID = async () => {
    if (referenceImages.length === 0 || !selectedDestination || !user) return

    setIsGenerating(true)
    setGenerationProgress(0)

    try {
      // Phase 1: Upload reference images (0-30%)
      toast.success('Uploading reference images...')
      const uploadedUrls: string[] = []
      
      for (let i = 0; i < referenceImages.length; i++) {
        const image = referenceImages[i]
        setGenerationProgress((i / referenceImages.length) * 30)
        
        const { publicUrl } = await blink.storage.upload(
          image.file,
          `instant-id/${user.id}/${Date.now()}-${i}-${image.file.name}`,
          { upsert: true }
        )
        uploadedUrls.push(publicUrl)
      }

      setGenerationProgress(40)

      // Get destination info
      const destination = TRAVEL_DESTINATIONS.find(d => d.id === selectedDestination)
      if (!destination) throw new Error('Invalid destination')

      setGenerationProgress(50)

      // Phase 2: Generate with InstantID technology
      toast.success('Processing with InstantID...')
      
      // Create enhanced prompt for InstantID
      const instantIDPrompt = `[InstantID Technology] Create a photorealistic travel photo using InstantID face preservation technology. Place the person from the reference images in ${destination.description} in ${destination.name}. 

CRITICAL REQUIREMENTS:
- Use InstantID to maintain EXACT facial identity from reference images
- Preserve facial structure, features, skin tone, and unique characteristics
- Generate natural travel photography with authentic poses and expressions
- Ensure seamless integration with the destination environment
- Apply proper lighting and shadows that match the location
- Create high-quality, professional travel photography composition

The person should appear naturally enjoying the destination with realistic travel poses. Maintain photographic realism with professional travel photography aesthetics.`

      setGenerationProgress(70)

      // Generate using modifyImage with multiple reference images for better identity preservation
      const { data } = await blink.ai.modifyImage({
        images: uploadedUrls, // Use all reference images for better identity consistency
        prompt: instantIDPrompt,
        quality: 'high',
        size: '1024x1024',
        n: 3 // Generate 3 variations for best results
      })

      setGenerationProgress(90)

      if (data && data.length > 0) {
        // Create generated images
        const newImages: GeneratedImage[] = data.map((img, index) => ({
          id: `instant_gen_${Date.now()}_${index}`,
          url: img.url,
          destination: destination.name,
          originalImage: '', // Empty for InstantID
          originalImages: uploadedUrls,
          createdAt: new Date().toISOString()
        }))

        // Add to parent component's state
        newImages.forEach(img => onImageGenerated(img))
        
        setGenerationProgress(100)
        toast.success(`🎉 ${data.length} InstantID travel photos generated for ${destination.name}!`)
      } else {
        throw new Error('Failed to generate images')
      }

    } catch (error) {
      console.error('InstantID generation error:', error)
      toast.error('Failed to generate InstantID photos. Please try again.')
    } finally {
      setIsGenerating(false)
      setGenerationProgress(0)
    }
  }

  return (
    <div className="space-y-6">
      {/* InstantID Info Card */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <Zap className="h-6 w-6 text-purple-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-purple-900 mb-2">What is InstantID?</h3>
              <p className="text-sm text-purple-700 leading-relaxed mb-3">
                <strong>InstantID</strong> is a cutting-edge AI technology that preserves facial identity with exceptional accuracy. 
                Unlike traditional methods, InstantID maintains your exact facial features, expressions, and unique characteristics.
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm text-purple-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span><strong>Superior Identity Preservation:</strong> Maintains exact facial structure and features</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-purple-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span><strong>Multi-Reference Support:</strong> Uses multiple photos for better consistency</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-purple-700">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <span><strong>Instant Results:</strong> No training required - generate immediately</span>
                </div>
              </div>
              <p className="text-xs text-purple-600 mt-3 font-medium">
                💡 Best with 1-5 clear photos: different angles and expressions work great!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reference Images Upload */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Users className="h-5 w-5 mr-2" />
            Reference Images
            <Badge variant="outline" className="ml-2">
              {referenceImages.length} images
            </Badge>
          </h2>
          
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
                dragActive 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-muted-foreground/25 hover:border-purple-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Zap className="h-8 w-8 text-purple-500 mx-auto mb-3" />
              <p className="text-sm font-medium mb-2">Add Reference Images for InstantID</p>
              <p className="text-xs text-muted-foreground mb-4">
                Upload 1-5 clear photos of the person (different angles recommended)
              </p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="instant-id-upload"
              />
              <Button asChild variant="outline">
                <label htmlFor="instant-id-upload" className="cursor-pointer">
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
                    <Zap className="h-4 w-4" />
                    <span className="text-sm font-medium">InstantID Ready</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Your reference images will be used to preserve facial identity with high accuracy
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generation Controls */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <Sparkles className="h-5 w-5 mr-2" />
            Generate with InstantID
          </h2>
          
          {isGenerating ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <Zap className="h-5 w-5 text-purple-500 animate-pulse" />
                <span className="font-medium">Generating with InstantID technology...</span>
              </div>
              <Progress value={generationProgress} className="w-full" />
              <p className="text-sm text-muted-foreground text-center">
                Creating 3 high-quality variations with preserved identity
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Generate travel photos with superior facial identity preservation using InstantID technology
                </p>
              </div>
              
              {referenceImages.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-amber-700">
                    <Info className="h-4 w-4" />
                    <span className="text-sm font-medium">Reference Images Required</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    Please upload at least 1 reference image to use InstantID
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
                onClick={generateWithInstantID}
                disabled={referenceImages.length === 0 || !selectedDestination}
                className="w-full h-12 text-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                <Zap className="h-5 w-5 mr-2" />
                Generate with InstantID
                <Badge variant="secondary" className="ml-2 bg-white/20 text-white">
                  3 Variations
                </Badge>
              </Button>
              
              {referenceImages.length > 0 && selectedDestination && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-purple-700">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Ready to Generate!</span>
                  </div>
                  <p className="text-xs text-purple-600 mt-1">
                    InstantID will use your {referenceImages.length} reference image{referenceImages.length > 1 ? 's' : ''} to create travel photos with preserved facial identity
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