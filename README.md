## Serverless REST Assignment - Distributed Systems.

__Name:__ Barry Nolan

__Demo:__ [Link to Youtube video](https://youtu.be/Yag508wW7bs)

### Context.

My web API is used to store data on albums. This data is stored in a table, which has a composite key made up of a unique ID and the album artist's name.

Attributes
+ `id`: A unique identifer for each album. First part of the table's composite key.
+ `artist`: The recording artist of the album. Second part of the table's composite key. Albums can be fetched using the path `id?artist=name`, where "name" is replaced with the artist.
+ `title`: The title of the album.
+ `genres`: An array of the album's genres.
+ `release_date`: The release date of the album.
+ `review`: A review of the album. Can be translated with Amazon Translate with the `?translate=lang` query, where "lang" is replaced by the target language code (eg. `?translate=de` for German).
+ `userId`: An optional attribute representing the ID of the user that added it. If an album is not missing this attribute, and it matches the ID of the user attempting to update the album, the album will be updated. In all other scenarios, the update will fail.

### App API endpoints.

+ GET /albums - Get all albums
+ GET /albums?artist={artist} - Filter all albums by 'artist'
+ GET /albums/{id}?artist={artist} - Get an album with a specified 'id' and 'artist'
+ GET /albums/{id}?artist={artist}&translate={lang} - Get a specified album translated into the target language, 'lang'
+ POST /albums - Add an album
+ PUT /albums/{id}?artist={artist} - Update a specified album

### Update constraint (if relevant).

To update an album, the album must have a `userId`. All seeded entries do not have a `userId`, but all entries created using the POST endpoint automatically assign the user's verified JSON Web Token `sub` attribute to its `userId`. As the POST endpoint requires the user to be signed in, this means that all albums created in this manner have a `userId`. 

If the PUT endpoint is called on an album that *does* contain a `userId`, it checks the user's verified JWT `sub` attribute against its own `userId`. If these match, the album is updated. However, if they do not match, the operation is stopped.

###  Extra.

For this assignment, I created a multi-stack solution in order to split up the functionality of the stack. `Ca1Stack` contains both an `AppApi` and an `AuthApi`. `AuthApi` handles all authentication in relation to signing in and out, etc., while `AppApi` contains everything to do with the REST API. 