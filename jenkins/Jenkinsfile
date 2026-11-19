pipeline {
  agent any

  triggers {
    cron('0 8 * * *')
  }

  environment {
    CI = 'true'
    GHCR_REGISTRY = 'ghcr.io'
    PLAYWRIGHT_RUNNER_IMAGE_BASE = 'ghcr.io/asaf-1/genai-agenticai-demo-playwright'
    PLAYWRIGHT_NODE_MODULES_VOLUME = 'agentic-ai-demo-jenkins-node-modules'
    GHCR_CREDENTIALS_ID = 'ghcr-read-token'
  }

  stages {
    stage('Daily Full Regression') {
      when {
        triggeredBy 'TimerTrigger'
      }
      steps {
        script {
          if (isUnix()) {
            withCredentials([usernamePassword(credentialsId: env.GHCR_CREDENTIALS_ID, usernameVariable: 'GHCR_USERNAME', passwordVariable: 'GHCR_PASSWORD')]) {
              sh '''
                set -e
                echo "$GHCR_PASSWORD" | docker login "$GHCR_REGISTRY" -u "$GHCR_USERNAME" --password-stdin
                runner_image=$(bash ./scripts/docker/resolve-playwright-runner.sh "${PLAYWRIGHT_RUNNER_IMAGE_BASE}:main" "" "agentic-ai-demo-playwright-jenkins")
                PLAYWRIGHT_NODE_MODULES_VOLUME="$PLAYWRIGHT_NODE_MODULES_VOLUME" \
                  bash ./scripts/docker/run-containerized-playwright.sh "$runner_image" 'npm run test:e2e'
              '''
            }
          } else {
            bat '''
              docker build -f Dockerfile.e2e -t agentic-ai-demo-playwright-jenkins .
              docker volume create %PLAYWRIGHT_NODE_MODULES_VOLUME%
              docker run --rm --shm-size=2g -e CI=true -v "%cd%:/workspace" -v %PLAYWRIGHT_NODE_MODULES_VOLUME%:/workspace/node_modules -w /workspace agentic-ai-demo-playwright-jenkins npm run test:e2e
            '''
          }
        }
      }
    }

    stage('Docker Validation') {
      when {
        not {
          triggeredBy 'TimerTrigger'
        }
      }
      steps {
        script {
          if (isUnix()) {
            sh 'docker build -t ai-agentic-project-jenkins .'
          } else {
            bat 'docker build -t ai-agentic-project-jenkins .'
          }
        }
      }
    }

    stage('Change-Based Validation') {
      when {
        not {
          triggeredBy 'TimerTrigger'
        }
      }
      steps {
        script {
          def docOnlyFiles = [
            'README.md',
            'AGENTS.md'
          ] as Set
          def candidateRefs = [(env.PLAYWRIGHT_BASE_REF ?: '').trim(), 'origin/main', 'HEAD~1'].findAll { it }
          def baseRef = null

          for (candidate in candidateRefs) {
            def status = isUnix()
              ? sh(returnStatus: true, script: "git rev-parse --verify ${candidate}")
              : bat(returnStatus: true, script: "@git rev-parse --verify ${candidate}")

            if (status == 0) {
              baseRef = candidate
              break
            }
          }

          def changedFiles = []

          if (baseRef) {
            def diffCommand = baseRef == 'HEAD~1'
              ? 'git diff --name-only --diff-filter=ACMRT HEAD~1 HEAD'
              : "git diff --name-only --diff-filter=ACMRT ${baseRef}...HEAD"
            def rawChangedFiles = isUnix()
              ? sh(returnStdout: true, script: diffCommand).trim()
              : bat(returnStdout: true, script: "@${diffCommand}").trim()

            if (rawChangedFiles) {
              changedFiles = rawChangedFiles
                .readLines()
                .collect { it.trim().replace('\\', '/') }
                .findAll { it }
            }
          }

          def changedSpecFiles = changedFiles.findAll { it ==~ /tests\/e2e\/.*\.spec\.ts/ }
          def onlyDocsAndTestSpecsChanged = changedFiles &&
            changedFiles.every { filePath ->
              changedSpecFiles.contains(filePath) ||
                filePath.startsWith('docs/') ||
                docOnlyFiles.contains(filePath)
            }

          if (baseRef) {
            echo "Playwright diff base: ${baseRef}"
          } else {
            echo 'Playwright diff base was not available. Running the full suite.'
          }

          if (changedFiles) {
            echo "Changed files:\n- ${changedFiles.join('\n- ')}"
          }

          if (baseRef && changedSpecFiles && onlyDocsAndTestSpecsChanged) {
            echo 'Only Playwright spec files changed, so Jenkins will run the targeted spec set.'

            if (isUnix()) {
              withCredentials([usernamePassword(credentialsId: env.GHCR_CREDENTIALS_ID, usernameVariable: 'GHCR_USERNAME', passwordVariable: 'GHCR_PASSWORD')]) {
                sh """
                  set -e
                  echo "\$GHCR_PASSWORD" | docker login "$GHCR_REGISTRY" -u "\$GHCR_USERNAME" --password-stdin
                  runner_image=\$(bash ./scripts/docker/resolve-playwright-runner.sh "${PLAYWRIGHT_RUNNER_IMAGE_BASE}:\${GIT_COMMIT:-main}" "${PLAYWRIGHT_RUNNER_IMAGE_BASE}:main" "agentic-ai-demo-playwright-jenkins")
                  PLAYWRIGHT_NODE_MODULES_VOLUME="$PLAYWRIGHT_NODE_MODULES_VOLUME" \
                    bash ./scripts/docker/run-containerized-playwright.sh "\$runner_image" 'npx playwright test --only-changed=${baseRef}'
                """
              }
            } else {
              bat """
                docker build -f Dockerfile.e2e -t agentic-ai-demo-playwright-jenkins .
                docker volume create %PLAYWRIGHT_NODE_MODULES_VOLUME%
                docker run --rm --shm-size=2g -e CI=true -v "%cd%:/workspace" -v %PLAYWRIGHT_NODE_MODULES_VOLUME%:/workspace/node_modules -w /workspace agentic-ai-demo-playwright-jenkins bash -lc "npx playwright test --only-changed=${baseRef}"
              """
            }
          } else {
            echo 'Application, framework, config, or mixed changes detected. Running the full suite.'

            if (isUnix()) {
              withCredentials([usernamePassword(credentialsId: env.GHCR_CREDENTIALS_ID, usernameVariable: 'GHCR_USERNAME', passwordVariable: 'GHCR_PASSWORD')]) {
                sh '''
                  set -e
                  echo "$GHCR_PASSWORD" | docker login "$GHCR_REGISTRY" -u "$GHCR_USERNAME" --password-stdin
                  runner_image=$(bash ./scripts/docker/resolve-playwright-runner.sh "${PLAYWRIGHT_RUNNER_IMAGE_BASE}:${GIT_COMMIT:-main}" "${PLAYWRIGHT_RUNNER_IMAGE_BASE}:main" "agentic-ai-demo-playwright-jenkins")
                  PLAYWRIGHT_NODE_MODULES_VOLUME="$PLAYWRIGHT_NODE_MODULES_VOLUME" \
                    bash ./scripts/docker/run-containerized-playwright.sh "$runner_image" 'npm run test:e2e'
                '''
              }
            } else {
              bat '''
                docker build -f Dockerfile.e2e -t agentic-ai-demo-playwright-jenkins .
                docker volume create %PLAYWRIGHT_NODE_MODULES_VOLUME%
                docker run --rm --shm-size=2g -e CI=true -v "%cd%:/workspace" -v %PLAYWRIGHT_NODE_MODULES_VOLUME%:/workspace/node_modules -w /workspace agentic-ai-demo-playwright-jenkins npm run test:e2e
              '''
            }
          }
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: '.artifacts/**/*, test-results/**/*', allowEmptyArchive: true
    }
  }
}
