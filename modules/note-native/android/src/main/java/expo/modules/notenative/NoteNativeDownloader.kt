package expo.modules.notenative

import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.exceptions.ReCaptchaException
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/**
 * Minimal HTTP transport for NewPipe Extractor.
 *
 * The extractor deliberately ships no networking of its own -- every consumer
 * supplies a Downloader. This is NØTE's own implementation (not taken from the
 * NewPipe app), written against java.net so it adds no dependency that could
 * conflict with the OkHttp version React Native already bundles.
 */
class NoteNativeDownloader : Downloader() {

  companion object {
    /**
     * YouTube serves different player payloads per client. A desktop UA keeps
     * the extractor on the code path it is written and tested against.
     */
    const val USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

    const val CONNECT_TIMEOUT_MS = 15_000
    const val READ_TIMEOUT_MS = 20_000

    /** Refuse to buffer a pathologically large body into memory. */
    const val MAX_BODY_BYTES = 8 * 1024 * 1024
  }

  @Throws(IOException::class, ReCaptchaException::class)
  override fun execute(request: Request): Response {
    val connection = (URL(request.url()).openConnection() as HttpURLConnection).apply {
      requestMethod = request.httpMethod()
      connectTimeout = CONNECT_TIMEOUT_MS
      readTimeout = READ_TIMEOUT_MS
      instanceFollowRedirects = true
      setRequestProperty("User-Agent", USER_AGENT)
    }

    try {
      // Caller-supplied headers win over our defaults.
      request.headers().forEach { (name, values) ->
        if (values.isEmpty()) {
          connection.setRequestProperty(name, null)
        } else {
          connection.setRequestProperty(name, values[0])
          values.drop(1).forEach { connection.addRequestProperty(name, it) }
        }
      }

      request.dataToSend()?.let { body ->
        connection.doOutput = true
        connection.setFixedLengthStreamingMode(body.size)
        connection.outputStream.use { it.write(body) }
      }

      val code = connection.responseCode

      // 429 is how YouTube asks for a captcha. The extractor has a dedicated
      // exception for it, so surface it rather than returning an error body.
      if (code == 429) {
        throw ReCaptchaException("reCaptcha challenge requested", request.url())
      }

      val body = readBody(connection, code)

      // Drop the null key java.net uses for the raw status line; the extractor
      // iterates this map and does not expect one.
      val headers = connection.headerFields
        .filterKeys { it != null }
        .mapKeys { (key, _) -> key!! }

      return Response(
        code,
        connection.responseMessage,
        headers,
        body,
        connection.url.toString()
      )
    } finally {
      connection.disconnect()
    }
  }

  private fun readBody(connection: HttpURLConnection, code: Int): String {
    val raw: InputStream = (if (code >= 400) connection.errorStream else connection.inputStream)
      ?: return ""

    val stream =
      if (connection.contentEncoding?.equals("gzip", ignoreCase = true) == true) {
        GZIPInputStream(raw)
      } else {
        raw
      }

    return stream.use { input ->
      val bytes = input.readBytes()
      if (bytes.size > MAX_BODY_BYTES) {
        throw IOException("Response body exceeded ${MAX_BODY_BYTES} bytes")
      }
      bytes.toString(Charsets.UTF_8)
    }
  }
}
