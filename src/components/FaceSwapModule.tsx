import { useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Card, CardContent } from './ui/card'
import { Progress } from './ui/progress'
import { Badge } from './ui/badge'
import { Upload, User, Image as ImageIcon, Download, Sparkles, Users, X, Info, RefreshCw } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { blink } from '../blink/client'

interface User {
  id: string
  email: string
  displayName?: string
}

interface FacePortrait {
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

interface FaceSwapModuleProps {
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

export function FaceSwapModule({ 
  user, 
  selectedDestination, 
  TRAVEL_DESTINATIONS, 
  onImageGenerated 
}: FaceSwapModuleProps) {
  const [facePortrait, setFacePortrait] = useState<FacePortrait | null>(null)
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
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type.startsWith('image/')) {
        const newPortrait: FacePortrait = {
          id: `portrait_${Date.now()}`,
          file,
          url: URL.createObjectURL(file)
        }
        setFacePortrait(newPortrait)
        toast.success('Face portrait uploaded successfully!')
      } else {
        toast.error('Please upload an image file')
      }
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.type.startsWith('image/')) {
        const newPortrait: FacePortrait = {
          id: `portrait_${Date.now()}`,
          file,
          url: URL.createObjectURL(file)
        }
        setFacePortrait(newPortrait)
        toast.success('Face portrait uploaded successfully!')
      } else {
        toast.error('Please upload an image file')
      }
    }
  }

  const removeFacePortrait = () => {
    if (facePortrait) {
      URL.revokeObjectURL(facePortrait.url)
      setFacePortrait(null)
    }
  }

  const generateWithFaceSwap = async () => {
    if (!facePortrait || !selectedDestination || !user) return

    setIsGenerating(true)
    setGenerationProgress(0)

    try {
      // Phase 1: Upload face portrait (0-20%)
      toast.success('Uploading face portrait...')
      const { publicUrl: portraitUrl } = await blink.storage.upload(
        facePortrait.file,
        `face-portraits/${user.id}/${Date.now()}-${facePortrait.file.name}`,
        { upsert: true }
      )

      setGenerationProgress(25)

      // Get destination info
      const destination = TRAVEL_DESTINATIONS.find(d => d.id === selectedDestination)
      if (!destination) throw new Error('Invalid destination')

      setGenerationProgress(40)

      // Phase 2: Generate base travel scene (40-60%)
      toast.success('Generating travel scene...')
      
      const scenePrompt = `Create a photorealistic travel scene in ${destination.description} in ${destination.name}. Generate a beautiful, high-quality travel photography composition showing the iconic location with proper lighting, shadows, and atmospheric details. The scene should be ready for a person to be naturally integrated into it. Professional travel photography style with excellent composition and lighting.`
      
      const { data: sceneData } = await blink.ai.generateImage({
        prompt: scenePrompt,
        quality: 'high',
        size: '1024x1024',
        n: 1
      })

      if (!sceneData || sceneData.length === 0) {
        throw new Error('Failed to generate travel scene')
      }

      setGenerationProgress(65)

      // Phase 3: Face swap integration (65-90%)
      toast.success('Performing face swap integration...')
      
      const faceSwapPrompt = `[Advanced Face Swap] Seamlessly integrate the face from the portrait image into this travel scene in ${destination.name}. 

CRITICAL REQUIREMENTS:
- Preserve the EXACT facial features, skin tone, and characteristics from the portrait
- Maintain natural facial proportions and expressions
- Blend the face naturally with appropriate lighting that matches the scene
- Ensure realistic shadows and highlights on the face
- Create a natural, believable integration that looks like the person is actually there
- Maintain high photographic quality and realism
- The person should appear naturally enjoying the travel destination

The result should look like a genuine travel photo of the person at this location, with perfect face preservation and natural integration.`

      const { data: finalData } = await blink.ai.modifyImage({
        images: [sceneData[0].url, portraitUrl], // Scene first, then face portrait
        prompt: faceSwapPrompt,
        quality: 'high',
        size: '1024x1024',
        n: 3 // Generate 3 variations for best results
      })

      setGenerationProgress(90)

      if (finalData && finalData.length > 0) {
        // Create generated images
        const newImages: GeneratedImage[] = finalData.map((img, index) => ({
          id: `faceswap_gen_${Date.now()}_${index}`,
          url: img.url,
          destination: destination.name,
          originalImage: portraitUrl,
          createdAt: new Date().toISOString()
        }))

        // Add to parent component's state
        newImages.forEach(img => onImageGenerated(img))
        
        setGenerationProgress(100)
        toast.success(`🎉 ${finalData.length} face-swapped travel photos generated for ${destination.name}!`)
      } else {
        throw new Error('Failed to generate face-swapped images')
      }

    } catch (error) {
      console.error('Face swap generation error:', error)
      toast.error('Failed to generate face-swapped photos. Please try again.')
    } finally {
      setIsGenerating(false)
      setGenerationProgress(0)
    }
  }

  return (
    <div className="space-y-6">
      {/* Face Swap Info Card */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-cyan-50">
        <CardContent className="p-6">
          <div className="flex items-start space-x-3">
            <User className="h-6 w-6 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Face Swap Technology</h3>
              <p className="text-sm text-blue-700 leading-relaxed mb-3">
                <strong>Advanced Face Swap</strong> creates realistic travel photos by seamlessly integrating your face 
                into AI-generated travel scenes. This two-step process ensures natural lighting and perfect integration.
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm text-blue-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span><strong>Two-Stage Process:</strong> Generate scene first, then integrate your face</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-blue-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span><strong>Natural Integration:</strong> Matches lighting and shadows automatically</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-blue-700">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span><strong>High Quality:</strong> Professional travel photography results</span>
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-3 font-medium">
                📸 Best with clear, front-facing portrait photos with good lighting!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Face Portrait Upload */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <User className="h-5 w-5 mr-2" />
            Face Portrait
            {facePortrait && (
              <Badge variant="outline" className="ml-2 text-green-700 border-green-300 bg-green-50">
                Ready
              </Badge>
            )}
          </h2>
          
          <div className="space-y-4">
            {facePortrait ? (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={facePortrait.url}
                    alt="Face Portrait"
                    className="w-full max-w-sm mx-auto rounded-lg object-cover aspect-square"
                  />
                  <button
                    onClick={removeFacePortrait}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-2 hover:bg-red-600 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-green-700">
                    <User className="h-4 w-4" />
                    <span className="text-sm font-medium">Face Portrait Ready</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    Your face will be seamlessly integrated into the travel scene
                  </p>
                </div>
              </div>
            ) : (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-muted-foreground/25 hover:border-blue-400'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <User className="h-12 w-12 text-blue-500 mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">Upload Your Face Portrait</p>
                  <p className="text-sm text-muted-foreground">
                    Clear, front-facing photo works best for face swapping
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="face-portrait-upload"
                />
                <Button asChild className="mt-4">
                  <label htmlFor="face-portrait-upload" className="cursor-pointer">
                    <Upload className="h-4 w-4 mr-2" />
                    Choose Portrait
                  </label>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Generation Controls */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <RefreshCw className="h-5 w-5 mr-2" />
            Generate with Face Swap
          </h2>
          
          {isGenerating ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-2">
                <User className="h-5 w-5 text-blue-500 animate-pulse" />
                <span className="font-medium">Generating face-swapped travel photos...</span>
              </div>
              <Progress value={generationProgress} className="w-full" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  {generationProgress < 25 ? 'Uploading portrait...' :
                   generationProgress < 40 ? 'Preparing destination...' :
                   generationProgress < 65 ? 'Generating travel scene...' :
                   generationProgress < 90 ? 'Performing face swap...' :
                   'Finalizing results...'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Generate travel photos by swapping your face into AI-generated travel scenes
                </p>
              </div>
              
              {!facePortrait && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-amber-700">
                    <Info className="h-4 w-4" />
                    <span className="text-sm font-medium">Face Portrait Required</span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">
                    Please upload a clear face portrait to use face swap technology
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
                onClick={generateWithFaceSwap}
                disabled={!facePortrait || !selectedDestination}
                className="w-full h-12 text-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
              >
                <User className="h-5 w-5 mr-2" />
                Generate Face Swap Photos
                <Badge variant="secondary" className="ml-2 bg-white/20 text-white">
                  3 Variations
                </Badge>
              </Button>
              
              {facePortrait && selectedDestination && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center space-x-2 text-blue-700">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-sm font-medium">Ready to Generate!</span>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">
                    Face swap will create realistic travel photos by integrating your portrait into {TRAVEL_DESTINATIONS.find(d => d.id === selectedDestination)?.name}
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