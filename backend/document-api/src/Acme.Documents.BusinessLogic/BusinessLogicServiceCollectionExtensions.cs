using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Delete;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Fail;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Get;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.GetContent;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Process;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Upload;
using Acme.Documents.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Documents.BusinessLogic.Abstractions.ImageProcessing;
using Acme.Documents.BusinessLogic.Handlers.Documents.Delete;
using Acme.Documents.BusinessLogic.Handlers.Documents.Fail;
using Acme.Documents.BusinessLogic.Handlers.Documents.Get;
using Acme.Documents.BusinessLogic.Handlers.Documents.GetContent;
using Acme.Documents.BusinessLogic.Handlers.Documents.Process;
using Acme.Documents.BusinessLogic.Handlers.Documents.Upload;
using Acme.Documents.BusinessLogic.Handlers.System.GetHealth;
using Acme.Documents.BusinessLogic.ImageProcessing;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Documents.BusinessLogic;

/// <summary>Registers every business handler. Add one line per new handler.</summary>
public static class BusinessLogicServiceCollectionExtensions
{
    public static IServiceCollection AddBusinessLogic(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IImageProcessor, NetVipsImageProcessor>();

        services.AddScoped<IGetHealthQueryHandler, GetHealthQueryHandler>();
        services.AddScoped<IUploadDocumentCommandHandler, UploadDocumentCommandHandler>();
        services.AddScoped<IGetDocumentQueryHandler, GetDocumentQueryHandler>();
        services.AddScoped<IGetDocumentContentQueryHandler, GetDocumentContentQueryHandler>();
        services.AddScoped<IProcessDocumentCommandHandler, ProcessDocumentCommandHandler>();
        services.AddScoped<IFailDocumentCommandHandler, FailDocumentCommandHandler>();
        services.AddScoped<IDeleteDocumentCommandHandler, DeleteDocumentCommandHandler>();
        return services;
    }
}
