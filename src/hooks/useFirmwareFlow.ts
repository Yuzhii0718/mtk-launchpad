import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BL2_RELEASE_API,
  DEFAULT_FIP_RELEASE_API,
} from '../constants'
import { BUILTIN_BL2_CANDIDATES } from '../data/builtinRamboot'
import type { Chip, DdrType, FirmwareCandidate, FirmwareSource, LogLevel } from '../types'
import { candidateKey } from '../utils/fileNameParsers'
import { compareMd5, computeMd5 } from '../utils/md5'
import { fetchReleaseCandidates, triggerBrowserFileDownload } from '../utils/githubRelease'
import { resolveBl2Selection, resolveFipSelection } from '../utils/firmwareSelection'
import { stringifyError } from '../utils/common'

type LoadMode = 'bl2-only' | 'bl2-fip'

type UseFirmwareFlowParams = {
  chip: Chip
  ddr: DdrType
  addLog: (level: LogLevel, message: string) => void
  getText: (key: string) => string
}

export function useFirmwareFlow(input: UseFirmwareFlowParams) {
  const { chip, ddr, addLog, getText } = input

  const [loadMode, setLoadMode] = useState<LoadMode>('bl2-fip')
  const [bl2Source, setBl2Source] = useState<FirmwareSource>('builtin')
  const [fipSource, setFipSource] = useState<Exclude<FirmwareSource, 'builtin'>>('upload')

  const [bl2ReleaseApi, setBl2ReleaseApi] = useState(DEFAULT_BL2_RELEASE_API)
  const [bl2ReleaseTag, setBl2ReleaseTag] = useState('-')
  const [bl2ReleaseCandidates, setBl2ReleaseCandidates] = useState<FirmwareCandidate[]>([])
  const [isLoadingBl2Release, setIsLoadingBl2Release] = useState(false)

  const [fipReleaseApi, setFipReleaseApi] = useState(DEFAULT_FIP_RELEASE_API)
  const [fipReleaseTag, setFipReleaseTag] = useState('-')
  const [fipReleaseCandidates, setFipReleaseCandidates] = useState<FirmwareCandidate[]>([])
  const [isLoadingFipRelease, setIsLoadingFipRelease] = useState(false)
  const [boardFilter, setBoardFilter] = useState('')

  const [selectedBuiltinBl2Key, setSelectedBuiltinBl2Key] = useState('')
  const [selectedReleaseBl2Key, setSelectedReleaseBl2Key] = useState('')
  const [executionRemoteBl2Key, setExecutionRemoteBl2Key] = useState('')
  const [selectedReleaseFipKey, setSelectedReleaseFipKey] = useState('')
  const [executionRemoteFipKey, setExecutionRemoteFipKey] = useState('')

  const [uploadedBl2File, setUploadedBl2File] = useState<File | null>(null)
  const [uploadedFipFile, setUploadedFipFile] = useState<File | null>(null)

  const [bl2ExpectedMd5, setBl2ExpectedMd5] = useState<string | undefined>()
  const [bl2ActualMd5, setBl2ActualMd5] = useState<string | undefined>()
  const [bl2Md5Passed, setBl2Md5Passed] = useState<boolean | null>(null)

  const [fipExpectedMd5, setFipExpectedMd5] = useState<string | undefined>()
  const [fipActualMd5, setFipActualMd5] = useState<string | undefined>()
  const [fipMd5Passed, setFipMd5Passed] = useState<boolean | null>(null)

  const builtinBl2Options = useMemo(
    () => BUILTIN_BL2_CANDIDATES.filter((candidate) => candidate.chip === chip && candidate.ddr === ddr),
    [chip, ddr],
  )

  const releaseBl2Options = useMemo(() => {
    return bl2ReleaseCandidates.filter((candidate) => {
      if (candidate.kind !== 'bl2' || candidate.chip !== chip) {
        return false
      }
      return candidate.ddr === ddr
    })
  }, [bl2ReleaseCandidates, chip, ddr])

  const releaseFipOptions = useMemo(() => {
    const filter = boardFilter.trim().toLowerCase()
    return fipReleaseCandidates.filter((candidate) => {
      if (candidate.kind !== 'fip' || candidate.chip !== chip) {
        return false
      }
      if (!filter) {
        return true
      }
      return candidate.fileName.toLowerCase().includes(filter)
    })
  }, [boardFilter, chip, fipReleaseCandidates])

  const selectedReleaseFipCandidate = useMemo(
    () => releaseFipOptions.find((candidate) => candidateKey(candidate) === selectedReleaseFipKey),
    [releaseFipOptions, selectedReleaseFipKey],
  )

  const selectedReleaseBl2Candidate = useMemo(
    () => releaseBl2Options.find((candidate) => candidateKey(candidate) === selectedReleaseBl2Key),
    [releaseBl2Options, selectedReleaseBl2Key],
  )

  const selectedExecutionRemoteBl2Candidate = useMemo(
    () => releaseBl2Options.find((candidate) => candidateKey(candidate) === executionRemoteBl2Key),
    [executionRemoteBl2Key, releaseBl2Options],
  )

  const selectedExecutionRemoteFipCandidate = useMemo(
    () => releaseFipOptions.find((candidate) => candidateKey(candidate) === executionRemoteFipKey),
    [executionRemoteFipKey, releaseFipOptions],
  )

  const matchedBoardBl2FromFipRelease = useMemo(() => {
    if (!selectedReleaseFipCandidate) {
      return undefined
    }

    const withVersion = fipReleaseCandidates.find((candidate) => (
      candidate.kind === 'bl2'
      && candidate.chip === selectedReleaseFipCandidate.chip
      && candidate.board === selectedReleaseFipCandidate.board
      && candidate.version === selectedReleaseFipCandidate.version
    ))
    if (withVersion) {
      return withVersion
    }

    return fipReleaseCandidates.find((candidate) => (
      candidate.kind === 'bl2'
      && candidate.chip === selectedReleaseFipCandidate.chip
      && candidate.board === selectedReleaseFipCandidate.board
    ))
  }, [fipReleaseCandidates, selectedReleaseFipCandidate])

  const canDownloadRambootPreloader = bl2Source === 'github-release' && Boolean(selectedReleaseBl2Candidate)
  const canUseRemoteBl2ForExecution = bl2Source === 'github-release' && Boolean(selectedReleaseBl2Candidate)
  const canDownloadBoardBl2 = loadMode === 'bl2-fip' && fipSource === 'github-release' && Boolean(matchedBoardBl2FromFipRelease)
  const canDownloadFip = loadMode === 'bl2-fip' && fipSource === 'github-release' && Boolean(selectedReleaseFipCandidate)
  const canUseRemoteFipForExecution = loadMode === 'bl2-fip' && fipSource === 'github-release' && Boolean(selectedReleaseFipCandidate)

  useEffect(() => {
    setSelectedBuiltinBl2Key(builtinBl2Options[0] ? candidateKey(builtinBl2Options[0]) : '')
  }, [builtinBl2Options])

  useEffect(() => {
    setSelectedReleaseBl2Key(releaseBl2Options[0] ? candidateKey(releaseBl2Options[0]) : '')
  }, [releaseBl2Options])

  useEffect(() => {
    if (bl2Source !== 'github-release') {
      setExecutionRemoteBl2Key('')
      return
    }

    if (!executionRemoteBl2Key) {
      return
    }

    const exists = releaseBl2Options.some((candidate) => candidateKey(candidate) === executionRemoteBl2Key)
    if (!exists) {
      setExecutionRemoteBl2Key('')
    }
  }, [bl2Source, executionRemoteBl2Key, releaseBl2Options])

  useEffect(() => {
    setSelectedReleaseFipKey(releaseFipOptions[0] ? candidateKey(releaseFipOptions[0]) : '')
  }, [releaseFipOptions])

  useEffect(() => {
    if (fipSource !== 'github-release') {
      setExecutionRemoteFipKey('')
      return
    }

    if (!executionRemoteFipKey) {
      return
    }

    const exists = releaseFipOptions.some((candidate) => candidateKey(candidate) === executionRemoteFipKey)
    if (!exists) {
      setExecutionRemoteFipKey('')
    }
  }, [executionRemoteFipKey, fipSource, releaseFipOptions])

  const setBl2Md5Unknown = useCallback((): void => {
    setBl2ExpectedMd5(undefined)
    setBl2ActualMd5(undefined)
    setBl2Md5Passed(null)
  }, [])

  const setFipMd5Unknown = useCallback((): void => {
    setFipExpectedMd5(undefined)
    setFipActualMd5(undefined)
    setFipMd5Passed(null)
  }, [])

  const handleSelectedReleaseFipKeyChange = useCallback((nextKey: string): void => {
    setSelectedReleaseFipKey(nextKey)
    setExecutionRemoteFipKey('')
    setFipMd5Unknown()
  }, [setFipMd5Unknown])

  const applyBl2Md5Result = useCallback((resolved: Awaited<ReturnType<typeof resolveBl2Selection>>, withLog: boolean): boolean => {
    const actual = computeMd5(resolved.payload)
    const passed = compareMd5(resolved.candidate.expectedMd5, actual)

    setBl2ExpectedMd5(resolved.candidate.expectedMd5)
    setBl2ActualMd5(actual)
    setBl2Md5Passed(passed)

    if (withLog) {
      addLog(passed ? 'success' : 'error', passed ? getText('md5Passed') : getText('md5Failed'))
    }

    return passed
  }, [addLog, getText])

  const applyFipMd5Result = useCallback((resolved: Awaited<ReturnType<typeof resolveFipSelection>>, withLog: boolean): boolean => {
    const actual = computeMd5(resolved.payload)
    const passed = compareMd5(resolved.candidate.expectedMd5, actual)

    setFipExpectedMd5(resolved.candidate.expectedMd5)
    setFipActualMd5(actual)
    setFipMd5Passed(passed)

    if (withLog) {
      addLog(passed ? 'success' : 'error', passed ? getText('md5Passed') : getText('md5Failed'))
    }

    return passed
  }, [addLog, getText])

  const resolveCurrentBl2 = useCallback(async (executionKeyOverride?: string): Promise<Awaited<ReturnType<typeof resolveBl2Selection>>> => {
    return resolveBl2Selection({
      bl2Source,
      builtinBl2Options,
      selectedBuiltinBl2Key,
      releaseBl2Options,
      selectedReleaseBl2Key,
      uploadedBl2File,
      executionRemoteBl2Key: executionKeyOverride ?? executionRemoteBl2Key,
    })
  }, [
    bl2Source,
    builtinBl2Options,
    executionRemoteBl2Key,
    releaseBl2Options,
    selectedBuiltinBl2Key,
    selectedReleaseBl2Key,
    uploadedBl2File,
  ])

  const resolveCurrentFip = useCallback(async (executionKeyOverride?: string): Promise<Awaited<ReturnType<typeof resolveFipSelection>>> => {
    return resolveFipSelection({
      fipSource,
      releaseFipOptions,
      selectedReleaseFipKey,
      uploadedFipFile,
      executionRemoteFipKey: executionKeyOverride ?? executionRemoteFipKey,
    })
  }, [executionRemoteFipKey, fipSource, releaseFipOptions, selectedReleaseFipKey, uploadedFipFile])

  const runBl2Md5Check = useCallback(async (withLog: boolean): Promise<void> => {
    if (bl2Source === 'github-release' && !executionRemoteBl2Key) {
      setBl2Md5Unknown()
      if (withLog) {
        addLog('warn', getText('remoteBl2NotSelectedForRun'))
      }
      return
    }

    try {
      const resolved = await resolveCurrentBl2()
      applyBl2Md5Result(resolved, withLog)
    } catch (error) {
      setBl2Md5Unknown()
      if (withLog) {
        addLog('error', stringifyError(error))
      }
    }
  }, [
    addLog,
    applyBl2Md5Result,
    bl2Source,
    executionRemoteBl2Key,
    getText,
    resolveCurrentBl2,
    setBl2Md5Unknown,
  ])

  const runFipMd5Check = useCallback(async (withLog: boolean): Promise<void> => {
    if (loadMode !== 'bl2-fip') {
      setFipMd5Unknown()
      return
    }

    if (fipSource === 'github-release' && !executionRemoteFipKey) {
      setFipMd5Unknown()
      if (withLog) {
        addLog('warn', getText('remoteFipNotSelectedForRun'))
      }
      return
    }

    try {
      const resolved = await resolveCurrentFip()
      applyFipMd5Result(resolved, withLog)
    } catch (error) {
      setFipMd5Unknown()
      if (withLog) {
        addLog('error', stringifyError(error))
      }
    }
  }, [
    addLog,
    applyFipMd5Result,
    executionRemoteFipKey,
    fipSource,
    getText,
    loadMode,
    resolveCurrentFip,
    setFipMd5Unknown,
  ])

  useEffect(() => {
    void runBl2Md5Check(false)
  }, [runBl2Md5Check])

  useEffect(() => {
    void runFipMd5Check(false)
  }, [runFipMd5Check])

  const handleFetchBl2Release = async (): Promise<void> => {
    setIsLoadingBl2Release(true)
    setExecutionRemoteBl2Key('')
    addLog('info', getText('loadingRelease'))
    try {
      const result = await fetchReleaseCandidates(bl2ReleaseApi.trim())
      setBl2ReleaseCandidates(result.candidates)
      setBl2ReleaseTag(result.tag)
      addLog('success', `${getText('releaseLoaded')} (${result.candidates.length})`)
    } catch (error) {
      addLog('error', stringifyError(error))
    } finally {
      setIsLoadingBl2Release(false)
    }
  }

  const handleFetchFipRelease = async (): Promise<void> => {
    setIsLoadingFipRelease(true)
    setExecutionRemoteFipKey('')
    addLog('info', getText('loadingRelease'))
    try {
      const result = await fetchReleaseCandidates(fipReleaseApi.trim())
      setFipReleaseCandidates(result.candidates)
      setFipReleaseTag(result.tag)
      addLog('success', `${getText('releaseLoaded')} (${result.candidates.length})`)
    } catch (error) {
      addLog('error', stringifyError(error))
    } finally {
      setIsLoadingFipRelease(false)
    }
  }

  const handleUseRemoteFipForExecution = async (): Promise<void> => {
    if (fipSource !== 'github-release') {
      return
    }

    if (!selectedReleaseFipCandidate) {
      addLog('warn', getText('noSelectedFipDownloadHint'))
      return
    }

    const pickedKey = candidateKey(selectedReleaseFipCandidate)
    setExecutionRemoteFipKey(pickedKey)
    addLog('info', `${getText('remoteFipSelectedForRun')}: ${selectedReleaseFipCandidate.fileName}`)

    try {
      const resolved = await resolveCurrentFip(pickedKey)
      applyFipMd5Result(resolved, true)
    } catch (error) {
      setFipMd5Unknown()
      addLog('error', stringifyError(error))
    }
  }

  const handleUseRemoteBl2ForExecution = async (): Promise<void> => {
    if (bl2Source !== 'github-release') {
      return
    }

    if (!selectedReleaseBl2Candidate) {
      addLog('warn', getText('noSelectedBl2DownloadHint'))
      return
    }

    const pickedKey = candidateKey(selectedReleaseBl2Candidate)
    setExecutionRemoteBl2Key(pickedKey)
    addLog('info', `${getText('remoteBl2SelectedForRun')}: ${selectedReleaseBl2Candidate.fileName}`)

    try {
      const resolved = await resolveCurrentBl2(pickedKey)
      applyBl2Md5Result(resolved, true)
    } catch (error) {
      setBl2Md5Unknown()
      addLog('error', stringifyError(error))
    }
  }

  const handleDownloadRambootPreloader = async (): Promise<void> => {
    try {
      if (!selectedReleaseBl2Candidate) {
        throw new Error(getText('noSelectedBl2DownloadHint'))
      }
      triggerBrowserFileDownload(selectedReleaseBl2Candidate)
      addLog('success', `BL2 ${selectedReleaseBl2Candidate.fileName} downloaded`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const handleDownloadBoardBl2 = async (): Promise<void> => {
    if (loadMode !== 'bl2-fip' || fipSource !== 'github-release') {
      return
    }

    try {
      if (!matchedBoardBl2FromFipRelease) {
        throw new Error(getText('noMatchedBoardBl2'))
      }
      triggerBrowserFileDownload(matchedBoardBl2FromFipRelease)
      addLog('success', `BL2 ${matchedBoardBl2FromFipRelease.fileName} downloaded`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const handleDownloadFip = async (): Promise<void> => {
    if (loadMode !== 'bl2-fip' || fipSource !== 'github-release') {
      return
    }

    try {
      if (!selectedReleaseFipCandidate) {
        throw new Error('FIP release file is not selected')
      }
      triggerBrowserFileDownload(selectedReleaseFipCandidate)
      addLog('success', `FIP ${selectedReleaseFipCandidate.fileName} downloaded`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const resolveVerifiedBl2ForRun = useCallback(async (): Promise<Awaited<ReturnType<typeof resolveBl2Selection>>> => {
    if (bl2Source === 'github-release' && !executionRemoteBl2Key) {
      throw new Error(getText('remoteBl2NotSelectedForRun'))
    }

    const resolved = await resolveCurrentBl2()
    const passed = applyBl2Md5Result(resolved, false)
    if (!passed) {
      throw new Error(`${getText('md5Failed')}: BL2`)
    }

    return resolved
  }, [applyBl2Md5Result, bl2Source, executionRemoteBl2Key, getText, resolveCurrentBl2])

  const resolveVerifiedFipForRun = useCallback(async (): Promise<Awaited<ReturnType<typeof resolveFipSelection>> | null> => {
    if (loadMode !== 'bl2-fip') {
      return null
    }

    if (fipSource === 'github-release' && !executionRemoteFipKey) {
      throw new Error(getText('remoteFipNotSelectedForRun'))
    }

    const resolved = await resolveCurrentFip()
    const passed = applyFipMd5Result(resolved, false)
    if (!passed) {
      throw new Error(`${getText('md5Failed')}: FIP`)
    }

    return resolved
  }, [
    applyFipMd5Result,
    executionRemoteFipKey,
    fipSource,
    getText,
    loadMode,
    resolveCurrentFip,
  ])

  return {
    loadMode,
    setLoadMode,
    bl2Source,
    setBl2Source,
    fipSource,
    setFipSource,
    bl2ReleaseApi,
    setBl2ReleaseApi,
    bl2ReleaseTag,
    isLoadingBl2Release,
    fipReleaseApi,
    setFipReleaseApi,
    fipReleaseTag,
    isLoadingFipRelease,
    boardFilter,
    setBoardFilter,
    selectedBuiltinBl2Key,
    setSelectedBuiltinBl2Key,
    selectedReleaseBl2Key,
    setSelectedReleaseBl2Key,
    selectedExecutionRemoteBl2Candidate,
    selectedReleaseFipKey,
    handleSelectedReleaseFipKeyChange,
    selectedExecutionRemoteFipCandidate,
    uploadedBl2File,
    setUploadedBl2File,
    uploadedFipFile,
    setUploadedFipFile,
    builtinBl2Options,
    releaseBl2Options,
    releaseFipOptions,
    canDownloadRambootPreloader,
    canUseRemoteBl2ForExecution,
    canDownloadBoardBl2,
    canDownloadFip,
    canUseRemoteFipForExecution,
    bl2ExpectedMd5,
    bl2ActualMd5,
    bl2Md5Passed,
    fipExpectedMd5,
    fipActualMd5,
    fipMd5Passed,
    handleFetchBl2Release,
    handleFetchFipRelease,
    handleUseRemoteBl2ForExecution,
    handleUseRemoteFipForExecution,
    runBl2Md5Check,
    runFipMd5Check,
    handleDownloadRambootPreloader,
    handleDownloadBoardBl2,
    handleDownloadFip,
    resolveVerifiedBl2ForRun,
    resolveVerifiedFipForRun,
  }
}
